"""Tests for portfolio / multi-asset backtesting."""

import numpy as np
import pandas as pd
import pytest

from app.backtesting.portfolio_engine import PortfolioBacktestEngine
from app.llm.parser import parse_builtin


@pytest.fixture
def two_assets():
    dates = pd.date_range("2024-01-01", periods=50, freq="D")
    np.random.seed(1)
    c1 = 100.0 + np.cumsum(np.random.randn(50))
    df1 = pd.DataFrame({
        "date": dates,
        "open": c1,
        "high": c1 + 1.0,
        "low": c1 - 1.0,
        "close": c1,
        "volume": 10000,
    })

    np.random.seed(2)
    c2 = 200.0 + np.cumsum(np.random.randn(50))
    df2 = pd.DataFrame({
        "date": dates,
        "open": c2,
        "high": c2 + 1.5,
        "low": c2 - 1.5,
        "close": c2,
        "volume": 20000,
    })

    return {"SPY": df1, "QQQ": df2}


def test_portfolio_backtest(two_assets):
    parsed = parse_builtin("Buy when SMA 5 crosses above SMA 15. Risk 1% per trade.")
    engine = PortfolioBacktestEngine(parsed.strategy, initial_capital=100_000.0)
    result = engine.run(two_assets)

    assert "portfolio_metrics" in result
    assert "portfolio_equity_curve" in result
    assert "asset_results" in result
    assert "SPY" in result["asset_results"]
    assert "QQQ" in result["asset_results"]
    assert len(result["portfolio_equity_curve"]) > 0

