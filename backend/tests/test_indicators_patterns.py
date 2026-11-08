"""Tests for candlestick patterns and volume indicators."""

import numpy as np
import pandas as pd
import pytest

from app.backtesting.indicators import (
    compute_indicator_series,
    engulfing,
    hammer,
    obv,
    pinbar,
    volume_indicator,
    vwap,
)
from app.backtesting.engine import BacktestEngine
from app.llm.parser import parse_builtin


@pytest.fixture
def sample_ohlcv_df():
    dates = pd.date_range("2024-01-01", periods=10, freq="D")
    return pd.DataFrame(
        {
            "date": dates,
            "open": [100.0, 102.0, 101.0, 105.0, 104.0, 103.0, 102.0, 106.0, 107.0, 108.0],
            "high": [103.0, 104.0, 102.0, 108.0, 105.0, 104.0, 103.0, 109.0, 110.0, 111.0],
            "low": [98.0, 99.0, 95.0, 103.0, 102.0, 97.0, 101.0, 104.0, 105.0, 106.0],
            "close": [102.0, 100.0, 101.5, 107.0, 103.0, 103.5, 102.5, 108.0, 109.0, 110.0],
            "volume": [1000.0, 1500.0, 2000.0, 1200.0, 800.0, 2500.0, 1100.0, 1800.0, 1400.0, 1600.0],
        }
    )


def test_volume_and_obv(sample_ohlcv_df):
    vol = volume_indicator(sample_ohlcv_df)
    assert len(vol) == len(sample_ohlcv_df)
    assert vol.iloc[0] == 1000.0

    vol_sma = volume_indicator(sample_ohlcv_df, period=3, component="sma")
    assert pd.isna(vol_sma.iloc[1])
    assert vol_sma.iloc[2] == pytest.approx((1000.0 + 1500.0 + 2000.0) / 3.0)

    obv_res = obv(sample_ohlcv_df)
    assert len(obv_res) == len(sample_ohlcv_df)
    # Day 0: diff is NaN -> 0
    # Day 1: close 100 < 102 -> -1500
    # Day 2: close 101.5 > 100 -> -1500 + 2000 = +500
    assert obv_res.iloc[1] == -1500.0
    assert obv_res.iloc[2] == 500.0


def test_vwap(sample_ohlcv_df):
    vw = vwap(sample_ohlcv_df)
    assert len(vw) == len(sample_ohlcv_df)
    # Day 0 typical price = (103 + 98 + 102) / 3 = 101.0
    assert vw.iloc[0] == pytest.approx(101.0)


def test_candlestick_patterns():
    # Construct a specific dataframe with clear hammer, pinbar, and engulfing candles
    df = pd.DataFrame(
        {
            "date": pd.date_range("2024-01-01", periods=4, freq="D"),
            # Bar 0: normal candle (upper shadow 3, lower shadow 1)
            # Bar 1: hammer (open 100, close 101, high 101.2, low 95.0) -> lower shadow 5, body 1, upper 0.2
            # Bar 2: bearish bar (open 105, close 101)
            # Bar 3: bullish engulfing (open 100, close 106)
            "open": [100.0, 100.0, 105.0, 100.0],
            "high": [104.0, 101.2, 106.0, 107.0],
            "low": [99.0, 95.0, 100.0, 99.0],
            "close": [101.0, 101.0, 101.0, 106.0],
            "volume": [1000.0, 2000.0, 1500.0, 3000.0],
        }
    )

    h = hammer(df)
    assert h.iloc[1] == 1.0
    assert h.iloc[0] == 0.0

    pb = pinbar(df, component="bullish")
    assert pb.iloc[1] == 1.0

    eng = engulfing(df, component="bullish")
    assert eng.iloc[3] == 1.0
    assert eng.iloc[2] == 0.0


def test_compute_indicator_series_dispatches(sample_ohlcv_df):
    for ind in ["VOLUME", "VWAP", "OBV", "HAMMER", "PINBAR", "ENGULFING"]:
        s = compute_indicator_series(sample_ohlcv_df, ind)
        assert len(s) == len(sample_ohlcv_df)


def test_parser_russian_and_patterns():
    # Russian pinbar prompt
    res = parse_builtin("Входи в лонг, если сформировался Пин-бар на дневном графике. Риск 1.5%, стоп-лосс 2%, тейк-профит 5%")
    assert res.strategy.entry_conditions[0].left.indicator.value == "PINBAR"
    assert res.strategy.risk.risk_per_trade == 0.015
    assert res.strategy.stop_loss == 0.02
    assert res.strategy.take_profit == 0.05
    assert len(res.clarifications) >= 0

    # Russian hammer prompt
    res_h = parse_builtin("Покупай когда сформировался молот, стоп 1.5%")
    assert res_h.strategy.entry_conditions[0].left.indicator.value == "HAMMER"
    assert res_h.strategy.stop_loss == 0.015

    # VWAP prompt
    res_v = parse_builtin("Buy when price crosses above VWAP with 2% stop-loss")
    assert res_v.strategy.entry_conditions[0].right.indicator.value == "VWAP"


def test_backtest_with_price_action(sample_ohlcv_df):
    parsed = parse_builtin("Buy on bullish pin bar with 2% stop loss and 4% take profit")
    engine = BacktestEngine(parsed.strategy)
    result = engine.run(sample_ohlcv_df)
    assert result["metrics"] is not None
    assert result["equity_curve"] is not None
