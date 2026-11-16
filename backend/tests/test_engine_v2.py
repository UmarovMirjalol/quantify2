"""Auto-resample, limit entries, spread costs, and bar debugger."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.backtesting.bars import align_to_timeframe, infer_bar_seconds
from app.backtesting.engine import BacktestEngine
from app.backtesting.orders import Order, OrderSide, OrderType, resolve_pending_fill
from app.llm.schemas import EntryOrderType, StrategySpec


@pytest.fixture
def bars_15m():
    dates = pd.date_range("2024-01-02 09:30", periods=160, freq="15min")
    close = 100.0 + np.cumsum(np.random.default_rng(0).normal(0.05, 0.15, len(dates)))
    return pd.DataFrame(
        {
            "date": dates.strftime("%Y-%m-%d %H:%M:%S"),
            "open": close - 0.05,
            "high": close + 0.25,
            "low": close - 0.25,
            "close": close,
            "volume": 1000,
        }
    )


def test_align_resamples_finer_data(bars_15m):
    out, meta = align_to_timeframe(bars_15m, "1h")
    assert meta["resampled"] is True
    assert meta["applied"] == "1h"
    assert len(out) < len(bars_15m)
    assert infer_bar_seconds(out) == pytest.approx(3600, rel=0.25)


def test_align_warns_when_data_too_coarse(bars_15m):
    hourly, _ = align_to_timeframe(bars_15m, "1h")
    out, meta = align_to_timeframe(hourly, "15m")
    assert meta["resampled"] is False
    assert meta["warning"]


def test_resolve_limit_and_stop():
    buy_limit = Order(
        side=OrderSide.BUY,
        quantity=1,
        signal_bar_index=0,
        order_type=OrderType.LIMIT,
        limit_price=100.0,
    )
    assert resolve_pending_fill(buy_limit, open_=101, high=102, low=99.5) == 100.0
    assert resolve_pending_fill(buy_limit, open_=101, high=102, low=100.5) is None

    sell_stop = Order(
        side=OrderSide.SELL,
        quantity=1,
        signal_bar_index=0,
        order_type=OrderType.STOP,
        limit_price=95.0,
    )
    assert resolve_pending_fill(sell_stop, open_=96, high=97, low=94) == 95.0


def _sma_spec(**extra):
    base = {
        "asset": "TEST",
        "initial_capital": 100000,
        "entry_conditions": [
            {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_above"}
        ],
        "exit_conditions": [
            {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_below"}
        ],
        "risk": {"percent_capital": 0.5},
        "position_sizing": "percent_capital",
        "commission": 0.001,
        "slippage": 0.0005,
    }
    base.update(extra)
    return StrategySpec.model_validate(base)


def test_engine_auto_resample_and_debug(bars_15m):
    strategy = _sma_spec(timeframe="1h")
    result = BacktestEngine(strategy).run(bars_15m)
    assert result["bars"]["resampled"] is True
    assert result["bars"]["applied"] == "1h"
    assert result["debug_bars"]
    assert "entry" in result["debug_bars"][0]
    assert "indicators" in result["debug_bars"][0]
    assert "volume" in result["price_series"][0]


def test_spread_worsens_costs(trending_df):
    cheap = BacktestEngine(_sma_spec(spread=0.0, slippage=0.0, commission=0.0)).run(trending_df)
    rich = BacktestEngine(_sma_spec(spread=0.01, slippage=0.0, commission=0.0)).run(trending_df)
    assert rich["total_slippage"] >= cheap["total_slippage"]


def test_limit_entry_field_accepted():
    strategy = _sma_spec(entry_order=EntryOrderType.LIMIT, limit_offset=0.002)
    assert strategy.entry_order == EntryOrderType.LIMIT
    assert strategy.limit_offset == 0.002
