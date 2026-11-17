"""Farm job registry + data health gap stats — offline."""

from __future__ import annotations

import time

import pandas as pd

from app.llm.parser import parse_builtin
from app.research.data_health import _gap_stats
from app.research.farm_jobs import (
    cancel_job,
    get_job,
    public_job,
    start_strategy_farm,
)


def test_gap_stats_flags_holes():
    dates = pd.to_datetime(
        ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-20", "2024-01-21", "2024-01-22"]
    )
    out = _gap_stats(pd.Series(dates))
    assert out["gaps"] >= 1
    assert out["max_gap_days"] is not None and out["max_gap_days"] >= 10


def test_farm_job_lifecycle(monkeypatch):
    import app.research.farm_jobs as fj

    def fake_one(strategy, symbol, history):
        time.sleep(0.05)
        return {
            "ticker": symbol,
            "source": "test",
            "bars": 100,
            "action": "wait",
            "total_return": 0.1,
            "buy_hold_return": 0.05,
            "sharpe_ratio": 1.2,
            "max_drawdown": -0.1,
            "trades": 3,
            "cagr": 0.08,
            "alpha_vs_hold": 0.05,
        }

    monkeypatch.setattr(fj, "_one_ticker", fake_one)
    monkeypatch.setattr(fj, "_symbols", lambda universe, tickers: ["AAA", "BBB", "CCC"])

    spec = parse_builtin("Buy when SMA 5 crosses above SMA 15 and sell when it crosses below.").strategy
    started = start_strategy_farm(spec, universe=None, tickers=["AAA"], history="1y")
    job_id = started["id"]
    deadline = time.time() + 3
    while time.time() < deadline:
        job = get_job(job_id)
        assert job is not None
        pub = public_job(job)
        if pub["status"] == "done":
            assert pub["done"] == 3
            assert pub["result"]["ok"] == 3
            return
        time.sleep(0.05)
    raise AssertionError("farm job did not finish")


def test_farm_job_cancel(monkeypatch):
    import app.research.farm_jobs as fj

    def slow(strategy, symbol, history):
        time.sleep(0.4)
        return {"ticker": symbol, "error": "slow"}

    monkeypatch.setattr(fj, "_one_ticker", slow)
    monkeypatch.setattr(fj, "_symbols", lambda universe, tickers: ["A", "B", "C", "D", "E", "F"])

    spec = parse_builtin("Buy when SMA 5 crosses above SMA 15 and sell when it crosses below.").strategy
    started = start_strategy_farm(spec, tickers=["A"], history="1y")
    time.sleep(0.05)
    cancel_job(started["id"])
    deadline = time.time() + 3
    while time.time() < deadline:
        job = get_job(started["id"])
        assert job is not None
        if job["status"] in ("cancelled", "done", "error"):
            assert job["status"] in ("cancelled", "done")
            return
        time.sleep(0.05)
    raise AssertionError("cancel did not settle")
