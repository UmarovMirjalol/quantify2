"""Stochastic, ADX/DMI, Donchian breakouts, history ranges, and the live signal."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.backtesting.engine import BacktestEngine
from app.backtesting.indicators import adx, donchian, stochastic
from app.config import get_settings
from app.data.loader import load_dataset
from app.data.market_fetcher import market_dataset_source
from app.database import init_db
from app.export.pine_generator import generate_pine_script
from app.export.python_generator import generate_python_script
from app.llm.parser import parse_builtin
from app.llm.schemas import StrategySpec
from app.main import app

BASE = {
    "asset": "TEST",
    "initial_capital": 100000,
    "commission": 0.001,
    "slippage": 0.0005,
    "position_sizing": "percent_capital",
    "risk": {"percent_capital": 0.5},
}
ALWAYS = [{"left": {"indicator": "PRICE"}, "operator": "greater_than", "right": 0}]
NEVER = [{"left": {"indicator": "PRICE"}, "operator": "less_than", "right": 0}]


@pytest.fixture(scope="module")
def sample() -> pd.DataFrame:
    return load_dataset("sample_data.csv")


def _bars(closes: list[float]) -> pd.DataFrame:
    close = np.array(closes, dtype=float)
    return pd.DataFrame(
        {
            "date": pd.date_range("2024-01-01", periods=len(close), freq="D"),
            "open": close,
            "high": close + 1,
            "low": close - 1,
            "close": close,
            "volume": 1_000,
        }
    )


def test_indicator_values_and_no_lookahead(sample):
    k, d = stochastic(sample, 14, 3)
    valid = k.dropna()
    assert ((valid >= 0) & (valid <= 100)).all()
    assert d.dropna().between(0, 100).all()

    adx_line, plus_di, minus_di = adx(sample, 14)
    assert adx_line.dropna().between(0, 100).all()
    assert (plus_di.dropna() >= 0).all() and (minus_di.dropna() >= 0).all()

    upper, middle, lower = donchian(sample, 20)
    # The channel uses the previous 20 bars only, so today's high can break above it.
    assert upper.iloc[25] == pytest.approx(sample["high"].iloc[5:25].max())
    assert lower.iloc[25] == pytest.approx(sample["low"].iloc[5:25].min())
    assert middle.iloc[25] == pytest.approx((upper.iloc[25] + lower.iloc[25]) / 2)

    # Truncating the future must not change past values.
    cut = sample.iloc[:150]
    for full, part in (
        (stochastic(sample, 14, 3)[0], stochastic(cut, 14, 3)[0]),
        (adx(sample, 14)[0], adx(cut, 14)[0]),
        (donchian(sample, 20)[0], donchian(cut, 20)[0]),
    ):
        pd.testing.assert_series_equal(full.iloc[:150], part, check_names=False)


@pytest.mark.parametrize(
    ("text", "indicators"),
    [
        ("Buy when Stochastic %K crosses above %D below 20, sell above 80", {"STOCH"}),
        ("Buy when stochastic is below 20 and sell when it is above 80", {"STOCH"}),
        ("Turtle breakout 55 days", {"DONCHIAN"}),
        ("Покупай на пробое 20-дневного максимума, выход на 10-дневном минимуме", {"DONCHIAN"}),
        ("Buy when +DI crosses above -DI", {"ADX"}),
        ("Buy when SMA 20 crosses above SMA 50 and ADX above 25", {"SMA", "ADX"}),
    ],
)
def test_parser_understands_new_indicators(text, indicators):
    spec = parse_builtin(text).strategy
    used = set()
    for cond in spec.entry_conditions + spec.exit_conditions:
        for side in (cond.left, cond.right):
            ind = getattr(side, "indicator", None)
            if ind is not None:
                used.add(getattr(ind, "value", ind))
    assert indicators <= used, (text, used)


SPECS = [
    {
        "entry_conditions": [{"left": {"indicator": "STOCH", "period": 14, "signal_period": 3}, "operator": "cross_above", "right": {"indicator": "STOCH", "period": 14, "signal_period": 3, "component": "d"}}],
        "exit_conditions": [{"left": {"indicator": "STOCH", "period": 14, "signal_period": 3}, "operator": "greater_than", "right": 80}],
    },
    {
        "entry_conditions": [
            {"left": {"indicator": "ADX", "period": 14, "component": "plus"}, "operator": "cross_above", "right": {"indicator": "ADX", "period": 14, "component": "minus"}},
            {"left": {"indicator": "ADX", "period": 14}, "operator": "greater_than", "right": 20},
        ],
        "exit_conditions": [{"left": {"indicator": "ADX", "period": 14, "component": "plus"}, "operator": "cross_below", "right": {"indicator": "ADX", "period": 14, "component": "minus"}}],
    },
    {
        "entry_conditions": [{"left": {"indicator": "PRICE"}, "operator": "greater_than", "right": {"indicator": "DONCHIAN", "period": 20}}],
        "exit_conditions": [{"left": {"indicator": "PRICE"}, "operator": "less_than", "right": {"indicator": "DONCHIAN", "period": 10, "component": "lower"}}],
    },
]


@pytest.mark.parametrize("rules", SPECS)
def test_standalone_export_matches_engine(sample, rules):
    strategy = StrategySpec.model_validate({**BASE, **rules})
    expected = BacktestEngine(strategy).run(sample)
    assert len(expected["trades"]) > 0
    namespace: dict = {"__name__": "exported"}
    exec(compile(generate_python_script(strategy, "test"), "exported.py", "exec"), namespace)  # noqa: S102
    trades, equity, stats = namespace["run"](sample.copy())
    assert len(trades) == len(expected["trades"])
    assert stats["final_equity"] == pytest.approx(expected["metrics"]["final_capital"], rel=1e-9)


def test_pine_export_uses_builtins():
    pine = "\n".join(generate_pine_script(StrategySpec.model_validate({**BASE, **rules}), "t") for rules in SPECS)
    assert "ta.stoch(" in pine
    assert "ta.dmi(" in pine
    assert "ta.highest(high, 20)[1]" in pine
    assert "ta.lowest(low, 10)[1]" in pine


def test_market_dataset_source():
    assert market_dataset_source("SPY_1d.csv") == ("SPY", "1d", "1y")
    assert market_dataset_source("BTC_USD_1d_max.csv") == ("BTC-USD", "1d", "max")
    assert market_dataset_source("AAPL_1h_10y.csv") == ("AAPL", "1h", "10y")
    assert market_dataset_source("sample_data.csv") is None
    assert market_dataset_source("3f2a_my_upload.csv") is None


def test_live_signal_states():
    rising = _bars([100 + i for i in range(20)])
    held = BacktestEngine(StrategySpec.model_validate({**BASE, "entry_conditions": ALWAYS, "exit_conditions": NEVER})).run(rising)
    sig = held["live_signal"]
    assert sig["in_position"] and sig["action"] == "hold"
    assert sig["entry_price"] == pytest.approx(101, rel=1e-3)
    assert sig["unrealized_pct"] > 0
    assert sig["last_close"] == pytest.approx(119)

    exiting = BacktestEngine(
        StrategySpec.model_validate(
            {**BASE, "entry_conditions": ALWAYS, "exit_conditions": [{"left": {"indicator": "PRICE"}, "operator": "greater_than", "right": 118}]}
        )
    ).run(rising)["live_signal"]
    assert exiting["action"] == "exit"

    flat = BacktestEngine(StrategySpec.model_validate({**BASE, "entry_conditions": NEVER, "exit_conditions": NEVER})).run(rising)
    assert flat["live_signal"]["action"] == "wait" and not flat["live_signal"]["in_position"]

    entering = BacktestEngine(
        StrategySpec.model_validate(
            {**BASE, "entry_conditions": [{"left": {"indicator": "PRICE"}, "operator": "greater_than", "right": 118}], "exit_conditions": NEVER}
        )
    ).run(rising)["live_signal"]
    assert entering["action"] == "enter" and not entering["in_position"]


def test_live_signal_endpoint_is_owner_scoped(monkeypatch):
    monkeypatch.delenv("APP_ACCESS_TOKEN", raising=False)
    get_settings.cache_clear()
    init_db()
    client = TestClient(app)
    run = client.post(
        "/api/backtest",
        json={
            "strategy_text": "Buy when SMA 10 crosses above SMA 30, sell when it crosses below",
            "dataset_id": "sample_data.csv",
            "config": {"initial_capital": 100000, "commission": 0.001, "slippage": 0.0005, "risk_per_trade": 0.01},
        },
        headers={"X-Client-Id": "signaler"},
    )
    assert run.status_code == 200, run.text
    assert run.json()["live_signal"]["action"] in {"enter", "wait", "hold", "exit", "add"}
    run_id = run.json()["id"]

    assert client.post(f"/api/backtests/{run_id}/live-signal", headers={"X-Client-Id": "other"}).status_code == 404
    fresh = client.post(f"/api/backtests/{run_id}/live-signal", headers={"X-Client-Id": "signaler"})
    assert fresh.status_code == 200, fresh.text
    body = fresh.json()
    assert body["refreshed"] is False
    assert body["as_of"] == run.json()["live_signal"]["as_of"]
