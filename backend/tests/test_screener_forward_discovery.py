"""Screener, strategy discovery, forward tests, and Yahoo symbol handling."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api import research_routes
from app.backtesting.engine import BacktestEngine
from app.config import get_settings
from app.data.loader import load_dataset
from app.data.market_fetcher import _normalize_symbol
from app.database import init_db
from app.llm.schemas import StrategySpec
from app.main import app
from app.research import screener
from app.research.discovery import run_discovery
from app.research.forward import evaluate_forward

SMA = {
    "asset": "TEST",
    "initial_capital": 100000,
    "commission": 0.001,
    "slippage": 0.0005,
    "position_sizing": "percent_capital",
    "risk": {"percent_capital": 1.0},
    "entry_conditions": [{"left": {"indicator": "SMA", "period": 10}, "operator": "cross_above", "right": {"indicator": "SMA", "period": 30}}],
    "exit_conditions": [{"left": {"indicator": "SMA", "period": 10}, "operator": "cross_below", "right": {"indicator": "SMA", "period": 30}}],
}


@pytest.fixture(scope="module")
def sample():
    return load_dataset("sample_data.csv")


@pytest.fixture()
def offline(monkeypatch, sample):
    calls: list[str] = []

    def fake(ticker, interval="1d", history="10y", yahoo_symbol=None):
        calls.append(ticker)
        if ticker.startswith("BAD"):
            raise RuntimeError("no such ticker")
        return sample.copy(), "test"

    monkeypatch.setattr(screener, "fetch_market_frame", fake)
    monkeypatch.setattr(research_routes, "fetch_market_frame", fake)
    monkeypatch.delenv("APP_ACCESS_TOKEN", raising=False)
    get_settings.cache_clear()
    init_db()
    return calls


def test_yahoo_symbols_survive_normalization():
    assert _normalize_symbol("BTC-USD") == ("BTCUSDT", "BTC-USD")
    assert _normalize_symbol("BRK-B")[1] == "BRK-B"
    assert _normalize_symbol("^GSPC")[1] == "^GSPC"
    assert _normalize_symbol("btc") == ("BTCUSDT", "BTC-USD")
    assert _normalize_symbol("AAPL") == ("AAPLUSDT", "AAPL")


def test_screener_ranks_and_reports_failures(offline):
    spec = StrategySpec.model_validate(SMA)
    out = screener.run_screener(spec, ["AAA", "BBB", "BAD1", "aaa"], history="1y")
    assert out["scanned"] == 3
    assert [f["ticker"] for f in out["failed"]] == ["BAD1"]
    assert {r["ticker"] for r in out["rows"]} == {"AAA", "BBB"}
    row = out["rows"][0]
    expected = BacktestEngine(spec).run(load_dataset("sample_data.csv"))
    assert row["action"] == expected["live_signal"]["action"]
    assert row["total_return"] == pytest.approx(expected["metrics"]["total_return"])
    assert sum(out["counts"].values()) == 2


def test_screener_endpoint_sizes_without_stop(offline):
    client = TestClient(app)
    res = client.post(
        "/api/screener",
        json={"strategy_text": "Buy when SMA 10 crosses above SMA 30, sell when it crosses below", "tickers": ["SPY", "QQQ"]},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["strategy"]["position_sizing"] == "percent_capital"
    assert body["strategy"]["risk"]["percent_capital"] == pytest.approx(1.0)
    assert len(body["rows"]) == 2
    assert client.post("/api/screener", json={"strategy_text": "Buy SMA cross", "universe": "nope"}).status_code == 422


def test_discovery_ranks_on_train_only(sample):
    out = run_discovery(sample, asset="TEST")
    assert out["tried"] == 30
    assert out["candidates"]
    train_sharpes = [c["train"]["sharpe_ratio"] for c in out["candidates"]]
    assert train_sharpes == sorted(train_sharpes, reverse=True)
    assert out["split"]["train_bars"] + out["split"]["test_bars"] == len(sample)
    for c in out["candidates"]:
        StrategySpec.model_validate(c["strategy"])
        if c["passes"]:
            assert c["test"]["total_return"] > 0
    assert out["verdict"] in {"found", "mixed", "none", "thin"}


def test_forward_ignores_signals_before_start(sample):
    spec = StrategySpec.model_validate(SMA)
    start = str(sample["date"].iloc[150])[:10]
    snap = evaluate_forward(spec, sample, start)
    assert snap["start_date"] == start
    assert snap["bars_live"] == len(sample) - 1 - 150
    assert all(t["entry_date"][:10] > start for t in snap["trades"])
    assert snap["equity"][0]["equity"] == pytest.approx(100000)
    assert snap["hold"][-1]["equity"] == pytest.approx(100000 * (1 + snap["hold_return"]))
    full = BacktestEngine(spec).run(sample)
    assert len(snap["trades"]) <= len(full["trades"])

    at_end = evaluate_forward(spec, sample, str(sample["date"].iloc[-1])[:10])
    assert at_end["bars_live"] == 0 and at_end["trades"] == [] and at_end["forward_return"] == 0


def test_forward_joins_a_position_already_open_at_start(sample):
    spec = StrategySpec.model_validate(SMA)
    engine = BacktestEngine(spec)
    k = next(
        i for i in range(60, len(sample) - 5)
        if engine.run(sample.iloc[: i + 1], metrics_only=True)["live_signal"]["action"] == "hold"
    )
    start = str(sample["date"].iloc[k])[:10]
    snap = evaluate_forward(spec, sample, start)
    assert snap["trades"] or snap["live_signal"]["in_position"]
    first_entry = snap["trades"][0]["entry_date"] if snap["trades"] else snap["live_signal"]["entry_date"]
    assert first_entry[:10] == str(sample["date"].iloc[k + 1])[:10]

    at_end = evaluate_forward(spec, sample.iloc[: k + 1], start)
    assert at_end["live_signal"]["action"] == "enter"


def test_forward_endpoints_are_scoped(offline):
    client = TestClient(app)
    me, other = {"X-Client-Id": "fw-owner"}, {"X-Client-Id": "fw-other"}
    made = client.post(
        "/api/forward",
        json={"strategy_text": "Buy when SMA 10 crosses above SMA 30, sell when it crosses below", "ticker": "spy"},
        headers=me,
    )
    assert made.status_code == 200, made.text
    body = made.json()
    assert body["ticker"] == "SPY"
    assert body["days_live"] == 0 and body["closed_trades"] == 0
    assert body["backtest_cagr"] is not None
    fid = body["id"]

    assert [f["id"] for f in client.get("/api/forward", headers=me).json()] == [fid]
    assert client.get("/api/forward", headers=other).json() == []
    assert client.get(f"/api/forward/{fid}", headers=other).status_code == 404
    assert client.post(f"/api/forward/{fid}/refresh", headers=me).status_code == 200
    assert client.delete(f"/api/forward/{fid}", headers=other).status_code == 404
    assert client.delete(f"/api/forward/{fid}", headers=me).json() == {"deleted": True}


def test_forward_from_backtest_needs_live_data(offline):
    client = TestClient(app)
    h = {"X-Client-Id": "fw-bt"}
    run = client.post(
        "/api/backtest",
        json={"strategy_text": "Buy when SMA 10 crosses above SMA 30, sell when it crosses below", "dataset_id": "sample_data.csv", "config": {}},
        headers=h,
    )
    assert run.status_code == 200, run.text
    res = client.post("/api/forward", json={"backtest_id": run.json()["id"]}, headers=h)
    assert res.status_code == 422
    assert "live ticker" in res.json()["detail"]
    ok = client.post("/api/forward", json={"backtest_id": run.json()["id"], "ticker": "SPY"}, headers=h)
    assert ok.status_code == 200, ok.text
    client.delete(f"/api/forward/{ok.json()['id']}", headers=h)
