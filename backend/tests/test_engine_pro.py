"""Shared-cash portfolio, adjclose adjustment, and public Python API."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.backtesting.portfolio_engine import PortfolioBacktestEngine
from app.data.adjust import adjust_ohlcv_from_adjclose
from app.llm.parser import parse_builtin
from quantify import Engine, load_csv, portfolio


@pytest.fixture
def two_assets():
    dates = pd.date_range("2024-01-01", periods=80, freq="D")
    rng = np.random.default_rng(7)
    c1 = 100.0 + np.cumsum(rng.normal(0.05, 0.8, 80))
    c2 = 50.0 + np.cumsum(rng.normal(0.04, 0.6, 80))
    mk = lambda c: pd.DataFrame(
        {
            "date": dates,
            "open": c - 0.1,
            "high": c + 0.5,
            "low": c - 0.5,
            "close": c,
            "volume": 10_000,
        }
    )
    return {"AAA": mk(c1), "BBB": mk(c2)}


def test_shared_cash_portfolio_runs(two_assets):
    spec = parse_builtin(
        "Buy when SMA 5 crosses above SMA 15 and sell when it crosses below.",
        initial_capital=100_000,
        commission=0.001,
        slippage=0.0005,
    ).strategy
    out = PortfolioBacktestEngine(spec, capital_mode="shared").run(two_assets)
    assert out["capital_mode"] == "shared"
    assert out["portfolio_equity_curve"]
    assert "cash" in out["portfolio_equity_curve"][0]
    assert set(out["asset_results"]) == {"AAA", "BBB"}
    # Cash is real, not equal to equity on every bar once invested.
    assert any(
        abs(row["cash"] - row["equity"]) > 1.0 for row in out["portfolio_equity_curve"][10:]
    ) or out["portfolio_metrics"]["number_of_trades"] == 0


def test_sleeves_mode_still_works(two_assets):
    spec = parse_builtin("Buy when SMA 5 crosses above SMA 15 and sell when it crosses below.").strategy
    out = PortfolioBacktestEngine(spec, capital_mode="sleeves").run(two_assets)
    assert out["capital_mode"] == "sleeves"
    assert out["portfolio_metrics"]["initial_capital"] == 100_000


def test_adjust_ohlcv_from_adjclose_scales_history():
    df = pd.DataFrame(
        {
            "date": ["2020-01-01", "2020-01-02", "2020-01-03"],
            "open": [100.0, 102.0, 50.0],
            "high": [101.0, 103.0, 51.0],
            "low": [99.0, 101.0, 49.0],
            "close": [100.0, 102.0, 50.0],
            "volume": [1000.0, 1000.0, 2000.0],
            # 2-for-1 split on last bar: adj_close keeps continuity
            "adj_close": [50.0, 51.0, 50.0],
        }
    )
    out = adjust_ohlcv_from_adjclose(df)
    assert "adj_close" not in out.columns
    assert out["close"].iloc[0] == pytest.approx(50.0)
    assert out["close"].iloc[-1] == pytest.approx(50.0)
    assert out["volume"].iloc[0] == pytest.approx(2000.0)


def test_python_api_engine_matches_site(sample_df, tmp_path):
    path = tmp_path / "sample.csv"
    sample_df.to_csv(path, index=False)
    eng = Engine.from_text(
        "Buy when the 5-day SMA crosses above the 20-day SMA and sell when it crosses below.",
        commission=0.0,
        slippage=0.0,
    )
    result = eng.run(load_csv(path))
    assert "metrics" in result
    assert "trades" in result
    assert result["metrics"]["initial_capital"] == 100_000


def test_python_api_portfolio(two_assets):
    out = portfolio(
        "Buy when SMA 5 crosses above SMA 15 and sell when it crosses below.",
        two_assets,
        capital_mode="shared",
    )
    assert out["capital_mode"] == "shared"
    assert len(out["asset_results"]) == 2
