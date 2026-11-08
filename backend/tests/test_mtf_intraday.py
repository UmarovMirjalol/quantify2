"""Tests for intraday data and multi-timeframe conditions."""

import numpy as np
import pandas as pd
import pytest

from app.backtesting.engine import BacktestEngine
from app.llm.schemas import Condition, ConditionOp, IndicatorRef, IndicatorType, StrategySpec
from app.strategies.interpreter import generate_signals, resample_ohlcv


@pytest.fixture
def intraday_15m_df():
    dates = pd.date_range("2024-01-02 09:30", periods=200, freq="15min")
    close = 100.0 + np.cumsum(np.random.normal(0.05, 0.2, len(dates)))
    return pd.DataFrame(
        {
            "date": dates.strftime("%Y-%m-%d %H:%M:%S"),
            "open": close - 0.1,
            "high": close + 0.3,
            "low": close - 0.3,
            "close": close,
            "volume": np.random.randint(1000, 10000, len(dates)),
        }
    )


def test_resample_ohlcv(intraday_15m_df):
    resampled_1h = resample_ohlcv(intraday_15m_df, "1h")
    # 200 15m bars is 50 hours
    assert len(resampled_1h) < len(intraday_15m_df)
    assert "open" in resampled_1h.columns
    assert "close" in resampled_1h.columns
    assert "high" in resampled_1h.columns
    assert "low" in resampled_1h.columns
    assert "volume" in resampled_1h.columns


def test_mtf_signal_generation(intraday_15m_df):
    # Strategy: Buy on 15m when close > 1h SMA(10)
    strat = StrategySpec(
        asset="SPY",
        timeframe="15m",
        entry_conditions=[
            Condition(
                left=IndicatorRef(indicator=IndicatorType.PRICE, component="close"),
                operator=ConditionOp.GREATER_THAN,
                right=IndicatorRef(indicator=IndicatorType.SMA, period=10, timeframe="1h"),
            )
        ],
        exit_conditions=[
            Condition(
                left=IndicatorRef(indicator=IndicatorType.PRICE, component="close"),
                operator=ConditionOp.LESS_THAN,
                right=IndicatorRef(indicator=IndicatorType.SMA, period=10, timeframe="1h"),
            )
        ],
    )

    entries, exits = generate_signals(intraday_15m_df, strat)
    assert len(entries) == len(intraday_15m_df)
    assert len(exits) == len(intraday_15m_df)

    engine = BacktestEngine(strat)
    res = engine.run(intraday_15m_df)
    assert "metrics" in res
    assert "equity_curve" in res

