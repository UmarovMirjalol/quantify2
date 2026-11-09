"""Python strategies: sandbox rules, look-ahead guard, engine parity, standalone export."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.backtesting.engine import BacktestEngine, BacktestError
from app.config import get_settings
from app.data.loader import load_dataset
from app.database import init_db
from app.export.python_generator import generate_python_script
from app.llm.schemas import StrategySpec
from app.main import app
from app.strategies.sandbox import TEMPLATE, SandboxError, run_custom, validate_code

CROSS_CODE = """
def strategy(df):
    fast = ta.sma(df["close"], 10)
    slow = ta.sma(df["close"], 30)
    entry = (fast.shift(1) <= slow.shift(1)) & (fast > slow)
    exit = (fast.shift(1) >= slow.shift(1)) & (fast < slow)
    return entry, exit
"""

COMMON = {
    "asset": "TEST",
    "initial_capital": 100000,
    "commission": 0.001,
    "slippage": 0.0005,
    "stop_loss": 0.05,
    "position_sizing": "percent_capital",
    "risk": {"percent_capital": 0.5},
}

RULES = {
    **COMMON,
    "entry_conditions": [
        {"left": {"indicator": "SMA", "period": 10}, "operator": "cross_above", "right": {"indicator": "SMA", "period": 30}}
    ],
    "exit_conditions": [
        {"left": {"indicator": "SMA", "period": 10}, "operator": "cross_below", "right": {"indicator": "SMA", "period": 30}}
    ],
}


@pytest.fixture(scope="module")
def data():
    return load_dataset("sample_data.csv")


def _summary(result):
    return round(result["metrics"]["final_capital"], 6), len(result["trades"])


def test_python_code_matches_the_same_rules(data):
    rules = BacktestEngine(StrategySpec.model_validate(RULES)).run(data)
    custom = BacktestEngine(StrategySpec.model_validate({**COMMON, "custom_code": CROSS_CODE})).run(data)
    assert len(rules["trades"]) > 0
    assert _summary(custom) == _summary(rules)


def test_size_output_scales_positions(data):
    half = CROSS_CODE.replace("return entry, exit", "return entry, exit, 0.25")
    full = BacktestEngine(StrategySpec.model_validate({**COMMON, "custom_code": CROSS_CODE})).run(data)
    small = BacktestEngine(StrategySpec.model_validate({**COMMON, "custom_code": half})).run(data)
    assert small["trades"][0]["quantity"] < full["trades"][0]["quantity"]
    template = BacktestEngine(StrategySpec.model_validate({**COMMON, "custom_code": TEMPLATE})).run(data)
    assert template["metrics"]["number_of_trades"] >= 1


@pytest.mark.parametrize(
    "code",
    [
        "import os\ndef strategy(df):\n    return df.close > 0, df.close < 0",
        "def strategy(df):\n    open('x', 'w')\n    return df.close > 0, df.close < 0",
        "def strategy(df):\n    df.__class__\n    return df.close > 0, df.close < 0",
        "def strategy(df):\n    df.to_csv('x.csv')\n    return df.close > 0, df.close < 0",
        "def strategy(df):\n    df.agg('to_pickle', 'x')\n    return df.close > 0, df.close < 0",
        "def strategy(df):\n    return getattr(df, 'close') > 0, df.close < 0",
        "def strategy(df):\n    '{0.x}'.format(df)\n    return df.close > 0, df.close < 0",
        "x = 1",
    ],
)
def test_dangerous_code_is_rejected(code):
    assert validate_code(code)


def test_lookahead_is_detected(data):
    peek = "def strategy(df):\n    up = df['close'].shift(-1) > df['close']\n    return up, ~up\n"
    with pytest.raises(SandboxError, match="Look-ahead"):
        run_custom(peek, data, check_lookahead=True)
    run_custom(CROSS_CODE, data, check_lookahead=True)


def test_runtime_errors_and_timeouts_are_reported(data):
    from app.strategies import sandbox

    with pytest.raises(BacktestError, match="ZeroDivisionError"):
        BacktestEngine(StrategySpec.model_validate({**COMMON, "custom_code": "def strategy(df):\n    1/0\n"})).run(data)
    with pytest.raises(SandboxError, match="longer than"):
        sandbox.run_custom_batch("def strategy(df):\n    while True:\n        pass\n", [data], timeout=3)


@pytest.mark.parametrize("spec", [RULES, {**COMMON, "custom_code": CROSS_CODE}, {**RULES, "side": "short"}])
def test_standalone_export_reproduces_the_engine(data, spec):
    strategy = StrategySpec.model_validate(spec)
    expected = BacktestEngine(strategy).run(data)
    namespace: dict = {"__name__": "exported"}
    exec(compile(generate_python_script(strategy, "test"), "exported.py", "exec"), namespace)  # noqa: S102
    trades, equity, stats = namespace["run"](data.copy())
    assert len(trades) == len(expected["trades"])
    assert stats["final_equity"] == pytest.approx(expected["metrics"]["final_capital"], rel=1e-9)
    assert equity[-1] == pytest.approx(expected["equity_curve"][-1]["equity"], rel=1e-9)


def test_api_runs_python_and_exports_everything(monkeypatch):
    monkeypatch.delenv("APP_ACCESS_TOKEN", raising=False)
    get_settings.cache_clear()
    init_db()
    client = TestClient(app)
    headers = {"X-Client-Id": "python-user"}

    info = client.get("/api/python-strategy").json()
    assert info["enabled"] and "def strategy" in info["template"]
    assert client.post("/api/python-strategy/check", json={"code": "import os"}).json()["ok"] is False

    body = {
        "strategy_text": "Python strategy: SMA 10/30 cross",
        "dataset_id": "sample_data.csv",
        "strategy": {**COMMON, "custom_code": CROSS_CODE},
    }
    run = client.post("/api/backtest", json=body, headers=headers)
    assert run.status_code == 200, run.text
    run_id = run.json()["id"]
    assert run.json()["strategy"]["custom_code"].strip().startswith("def strategy")

    peek = {**body, "strategy": {**COMMON, "custom_code": "def strategy(df):\n    up = df.close.shift(-1) > df.close\n    return up, ~up\n"}}
    assert client.post("/api/backtest", json=peek, headers=headers).status_code == 422

    assert client.get(f"/api/backtests/{run_id}/export/pine", headers=headers).status_code == 422
    exported = client.get(f"/api/backtests/{run_id}/export/python", headers=headers)
    assert exported.status_code == 200 and "def strategy" in exported.json()["code"]

    assert client.get(f"/api/backtests/{run_id}/synthetic", headers=headers).status_code == 200
    verdict = client.get(f"/api/backtests/{run_id}/verdict", headers=headers).json()
    assert verdict["grade"] in {"robust", "promising", "overfit", "no_edge", "insufficient"}

    archive = client.get("/api/backtests/export-all", headers=headers).json()
    assert archive["format"] == "quantify-archive"
    assert run_id in [b["id"] for b in archive["backtests"]]
    assert all(b["id"] != run_id for b in client.get("/api/backtests/export-all", headers={"X-Client-Id": "other"}).json()["backtests"])

    monkeypatch.setenv("ALLOW_CUSTOM_CODE", "false")
    get_settings.cache_clear()
    assert client.post("/api/backtest", json=body, headers=headers).status_code == 403
    monkeypatch.delenv("ALLOW_CUSTOM_CODE")
    get_settings.cache_clear()
