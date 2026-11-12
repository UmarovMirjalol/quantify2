"""Leaderboard ranks daily playbook strategies on cached synthetic prices."""

import numpy as np
import pandas as pd

from app.research import leaderboard as lb


def _frame(n: int = 600, drift: float = 0.0005, seed: int = 1) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    close = 100 * np.cumprod(1 + drift + rng.normal(0, 0.012, n))
    dates = pd.bdate_range("2022-01-03", periods=n)
    return pd.DataFrame(
        {"date": dates.strftime("%Y-%m-%d"), "open": close, "high": close * 1.01, "low": close * 0.99, "close": close, "volume": 1e6}
    )


def test_board_ranks_daily_strategies(monkeypatch):
    monkeypatch.setattr(lb, "TICKERS", ("SPY",))
    monkeypatch.setattr(lb, "fetch_market_frame", lambda t, history="10y": (_frame(), "test"))
    board = lb.build()
    rows = board["rows"]
    assert board["status"] == "ready" and rows
    years = [r["return_year"] for r in rows]
    assert years == sorted(years, reverse=True)
    ids = {r["id"] for r in rows}
    assert "monday-friday" in ids and "golden-cross" in ids
    assert "mtf-15m-4h" not in ids and "vwap-trend" not in ids
    assert all(r["ticker"] == "SPY" for r in rows)


def test_missing_board_reports_building(monkeypatch):
    monkeypatch.setattr(lb, "_CACHE", {})
    started = []
    monkeypatch.setattr(lb, "_build_in_background", lambda: started.append(True))
    assert lb.leaderboard() == {"status": "building"}
    assert started
