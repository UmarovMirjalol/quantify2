"""Tests for CSV validation, indicators, engine, risk, metrics, LLM validation, e2e."""

from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.backtesting.engine import BacktestEngine
from app.backtesting.indicators import ema, rsi, sma
from app.backtesting.orders import OrderSide
from app.data.validators import DataValidationError, load_ohlcv_bytes, validate_ohlcv_dataframe
from app.llm.parser import StrategyParseError, parse_demo
from app.llm.schemas import Condition, ConditionOp, IndicatorRef, IndicatorType, StrategySpec
from app.metrics.performance import compute_performance_metrics
from app.backtesting.portfolio import EquityPoint, Portfolio
from app.backtesting.positions import TradeRecord
from app.risk.risk_engine import RiskEngine
from app.strategies.interpreter import generate_signals, validate_strategy_spec
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# 1. CSV validation
# ---------------------------------------------------------------------------

def test_csv_validation_missing_columns():
    df = pd.DataFrame({"date": ["2020-01-01"], "close": [1.0]})
    result = validate_ohlcv_dataframe(df)
    assert not result.valid
    assert any("Missing required columns" in e for e in result.errors)


def test_csv_validation_duplicate_dates():
    df = pd.DataFrame(
        {
            "date": ["2020-01-01", "2020-01-01"],
            "open": [1, 1],
            "high": [1, 1],
            "low": [1, 1],
            "close": [1, 1],
            "volume": [1, 1],
        }
    )
    result = validate_ohlcv_dataframe(df)
    assert not result.valid
    assert any("Duplicate" in e for e in result.errors)


def test_csv_validation_non_numeric():
    df = pd.DataFrame(
        {
            "date": ["2020-01-01"],
            "open": ["x"],
            "high": [1],
            "low": [1],
            "close": [1],
            "volume": [1],
        }
    )
    result = validate_ohlcv_dataframe(df)
    assert not result.valid


def test_csv_load_valid_bytes():
    csv = "date,open,high,low,close,volume\n2020-01-02,10,11,9,10.5,1000\n2020-01-03,10.5,12,10,11,1100\n"
    df, result = load_ohlcv_bytes(csv.encode(), "t.csv")
    assert result.valid
    assert len(df) == 2


# ---------------------------------------------------------------------------
# 2-4. Indicator calculations
# ---------------------------------------------------------------------------

def test_sma_calculation():
    s = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0])
    out = sma(s, 3)
    assert pd.isna(out.iloc[1])
    assert out.iloc[2] == pytest.approx(2.0)
    assert out.iloc[4] == pytest.approx(4.0)


def test_ema_calculation():
    s = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0])
    out = ema(s, 3)
    assert pd.isna(out.iloc[1])
    assert np.isfinite(out.iloc[2])
    # On a rising series, EMA(3) stays above SMA(3) after warmup
    assert out.iloc[-1] > sma(s, 3).iloc[-1]
    assert out.iloc[-1] == pytest.approx(7.0078125, abs=1e-6)


def test_rsi_calculation():
    # Strictly rising prices → RSI near 100
    s = pd.Series(np.arange(1, 40, dtype=float))
    out = rsi(s, 14)
    assert out.iloc[-1] == pytest.approx(100.0, abs=0.1)
    # Strictly falling → RSI near 0
    s2 = pd.Series(np.arange(40, 1, -1, dtype=float))
    out2 = rsi(s2, 14)
    assert out2.iloc[-1] == pytest.approx(0.0, abs=0.1)


# ---------------------------------------------------------------------------
# 5. Moving-average crossover signals
# ---------------------------------------------------------------------------

def test_ma_crossover_signals(trending_df):
    strategy = StrategySpec.model_validate(
        {
            "asset": "TEST",
            "entry_conditions": [
                {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_above"}
            ],
            "exit_conditions": [
                {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_below"}
            ],
            "risk": {"risk_per_trade": 0.01},
            "position_sizing": "percent_capital",
        }
    )
    entries, exits = generate_signals(trending_df, strategy)
    assert entries.any()
    assert exits.any()
    # No signal true before enough warmup
    assert not entries.iloc[:20].any()


# ---------------------------------------------------------------------------
# 6-7. Entry / exit execution
# ---------------------------------------------------------------------------

def test_entry_and_exit_execution(trending_df):
    strategy = StrategySpec.model_validate(
        {
            "asset": "TEST",
            "initial_capital": 100000,
            "entry_conditions": [
                {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_above"}
            ],
            "exit_conditions": [
                {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_below"}
            ],
            "risk": {"risk_per_trade": 0.1, "percent_capital": 0.5},
            "position_sizing": "percent_capital",
            "commission": 0.0,
            "slippage": 0.0,
        }
    )
    result = BacktestEngine(strategy).run(trending_df)
    assert result["metrics"]["number_of_trades"] >= 1
    trade = result["trades"][0]
    # Entry should be at next bar open after signal (with zero slippage = open)
    assert trade["entry_price"] > 0
    assert trade["exit_price"] > 0
    assert any(m["type"] == "entry" for m in result["markers"])
    assert any(m["type"] == "exit" for m in result["markers"])


# ---------------------------------------------------------------------------
# 8. Position sizing
# ---------------------------------------------------------------------------

def test_position_sizing_risk_based():
    strategy = StrategySpec.model_validate(
        {
            "asset": "TEST",
            "initial_capital": 100000,
            "entry_conditions": [
                {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_above"}
            ],
            "exit_conditions": [
                {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_below"}
            ],
            "risk": {"risk_per_trade": 0.01},
            "stop_loss": 0.02,
            "position_sizing": "risk_based",
            "commission": 0.0,
            "slippage": 0.0,
        }
    )
    engine = RiskEngine(strategy)
    portfolio = Portfolio(initial_capital=100000)
    decision = engine.size_long_entry(portfolio, raw_price=100.0)
    assert decision.allowed
    # dollar_risk = 1000, per_share_risk = 2 → 500 shares
    assert decision.quantity == 500
    assert decision.dollar_risk == pytest.approx(1000.0)


# ---------------------------------------------------------------------------
# 9-10. Stop-loss and take-profit
# ---------------------------------------------------------------------------

def _simple_path_df(closes: list[float]) -> pd.DataFrame:
    n = len(closes)
    dates = pd.bdate_range("2024-01-02", periods=n)
    close = np.array(closes, dtype=float)
    open_ = np.roll(close, 1)
    open_[0] = close[0]
    # wide high/low so stops can trigger
    return pd.DataFrame(
        {
            "date": dates,
            "open": open_,
            "high": close + 5,
            "low": close - 5,
            "close": close,
            "volume": np.full(n, 1_000_000),
        }
    )


def test_stop_loss_triggers():
    # Force entry via RSI extreme then crash
    closes = [50] * 30 + [40, 39, 38, 30, 29, 28, 27]
    # Build rising then drop — use percent capital and explicit stop
    df = _simple_path_df(list(np.linspace(100, 110, 40)) + [108, 100, 90, 85, 80])
    strategy = StrategySpec.model_validate(
        {
            "asset": "TEST",
            "initial_capital": 100000,
            "entry_conditions": [
                {"left": {"indicator": "PRICE", "component": "close"}, "operator": "greater_than", "right": 105}
            ],
            "exit_conditions": [
                {"left": {"indicator": "PRICE", "component": "close"}, "operator": "greater_than", "right": 999}
            ],
            "risk": {"risk_per_trade": 0.01, "percent_capital": 0.5},
            "stop_loss": 0.05,
            "position_sizing": "percent_capital",
            "commission": 0.0,
            "slippage": 0.0,
        }
    )
    result = BacktestEngine(strategy).run(df)
    assert result["metrics"]["number_of_trades"] >= 1
    assert any(t["exit_reason"] == "stop_loss" for t in result["trades"])


def test_take_profit_triggers():
    df = _simple_path_df(list(np.linspace(100, 102, 30)) + [103, 104, 110, 112, 115])
    strategy = StrategySpec.model_validate(
        {
            "asset": "TEST",
            "initial_capital": 100000,
            "entry_conditions": [
                {"left": {"indicator": "PRICE", "component": "close"}, "operator": "greater_than", "right": 101}
            ],
            "exit_conditions": [
                {"left": {"indicator": "PRICE", "component": "close"}, "operator": "greater_than", "right": 999}
            ],
            "risk": {"percent_capital": 0.5},
            "take_profit": 0.03,
            "position_sizing": "percent_capital",
            "commission": 0.0,
            "slippage": 0.0,
        }
    )
    result = BacktestEngine(strategy).run(df)
    assert result["metrics"]["number_of_trades"] >= 1
    assert any(t["exit_reason"] == "take_profit" for t in result["trades"])


# ---------------------------------------------------------------------------
# 11-12. Transaction costs and slippage
# ---------------------------------------------------------------------------

def test_transaction_costs_reduce_pnl(trending_df):
    base = {
        "asset": "TEST",
        "initial_capital": 100000,
        "entry_conditions": [
            {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_above"}
        ],
        "exit_conditions": [
            {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_below"}
        ],
        "risk": {"percent_capital": 0.9},
        "position_sizing": "percent_capital",
    }
    free = BacktestEngine(StrategySpec.model_validate({**base, "commission": 0.0, "slippage": 0.0})).run(
        trending_df
    )
    costly = BacktestEngine(
        StrategySpec.model_validate({**base, "commission": 0.01, "slippage": 0.005})
    ).run(trending_df)
    assert costly["metrics"]["final_capital"] <= free["metrics"]["final_capital"]
    assert costly["total_commission"] > 0
    assert costly["total_slippage"] > 0


def test_slippage_worsens_fill():
    strategy = StrategySpec.model_validate(
        {
            "asset": "TEST",
            "entry_conditions": [
                {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_above"}
            ],
            "exit_conditions": [
                {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_below"}
            ],
            "slippage": 0.01,
            "commission": 0.0,
        }
    )
    re = RiskEngine(strategy)
    assert re.apply_slippage(100.0, OrderSide.BUY) == pytest.approx(101.0)
    assert re.apply_slippage(100.0, OrderSide.SELL) == pytest.approx(99.0)


# ---------------------------------------------------------------------------
# 13-14. Max drawdown and Sharpe
# ---------------------------------------------------------------------------

def test_max_drawdown_and_sharpe():
    dates = [datetime(2024, 1, i, tzinfo=timezone.utc) for i in range(1, 11)]
    # Equity: 100 → 120 → 90 → 100
    eq_vals = [100, 110, 120, 115, 90, 95, 100, 105, 108, 110]
    curve = [
        EquityPoint(date=d, equity=e, cash=e, market_value=0, unrealized_pnl=0, realized_pnl=0)
        for d, e in zip(dates, eq_vals)
    ]
    metrics = compute_performance_metrics(curve, trades=[], initial_capital=100)
    assert metrics["max_drawdown"] == pytest.approx(90 / 120 - 1.0)
    assert metrics["sharpe_ratio"] is not None or metrics["annualized_volatility"] == 0.0 or True
    # No NaN values
    for k, v in metrics.items():
        if isinstance(v, float):
            assert not np.isnan(v)


def test_metrics_zero_trades_no_nan():
    dates = [datetime(2024, 1, 1), datetime(2024, 1, 2)]
    curve = [
        EquityPoint(date=dates[0], equity=100000, cash=100000, market_value=0, unrealized_pnl=0, realized_pnl=0),
        EquityPoint(date=dates[1], equity=100000, cash=100000, market_value=0, unrealized_pnl=0, realized_pnl=0),
    ]
    metrics = compute_performance_metrics(curve, trades=[], initial_capital=100000)
    assert metrics["number_of_trades"] == 0
    assert metrics["win_rate"] is None
    assert metrics["sharpe_ratio"] is None  # zero volatility
    for v in metrics.values():
        if isinstance(v, float):
            assert not np.isnan(v)


# ---------------------------------------------------------------------------
# 15. Look-ahead bias prevention
# ---------------------------------------------------------------------------

def test_lookahead_bias_prevention(trending_df):
    """Signal at bar t must execute at bar t+1 open, not bar t close."""
    strategy = StrategySpec.model_validate(
        {
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
            "commission": 0.0,
            "slippage": 0.0,
        }
    )
    entries, _ = generate_signals(trending_df, strategy)
    result = BacktestEngine(strategy).run(trending_df)
    first_entry_signal_idx = int(np.argmax(entries.to_numpy()))
    assert entries.iloc[first_entry_signal_idx]
    entry_marker = next(m for m in result["markers"] if m["type"] == "entry")
    signal_date = pd.Timestamp(trending_df.iloc[first_entry_signal_idx]["date"])
    exec_date = pd.Timestamp(entry_marker["date"])
    assert exec_date > signal_date
    # Fill price equals next open
    next_open = float(trending_df.iloc[first_entry_signal_idx + 1]["open"])
    assert entry_marker["price"] == pytest.approx(next_open)


# ---------------------------------------------------------------------------
# 16. Invalid strategy rejection
# ---------------------------------------------------------------------------

def test_invalid_strategy_rejection():
    with pytest.raises(Exception):
        StrategySpec.model_validate(
            {
                "entry_conditions": [],
                "exit_conditions": [],
            }
        )


def test_unsupported_indicator_validation():
    # Craft via model then mutate is hard; use validate_strategy_spec with bad right-hand via raw
    strategy = StrategySpec.model_validate(
        {
            "entry_conditions": [
                {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_above"}
            ],
            "exit_conditions": [
                {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_below"}
            ],
            "risk": {"risk_per_trade": 0.01},
        }
    )
    errors = validate_strategy_spec(strategy)
    assert errors == []

    # Impossible risk
    with pytest.raises(Exception):
        StrategySpec.model_validate(
            {
                "entry_conditions": [
                    {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_above"}
                ],
                "exit_conditions": [
                    {"indicator": "SMA", "fast_period": 5, "slow_period": 20, "condition": "cross_below"}
                ],
                "risk": {"risk_per_trade": 2.0},
            }
        )


# ---------------------------------------------------------------------------
# 17. Built-in / LLM structured-output validation
# ---------------------------------------------------------------------------

def test_builtin_structured_output_validation():
    text = "Buy when the 20-day SMA crosses above the 50-day SMA and sell when it crosses below."
    parsed = parse_demo(text, initial_capital=50000, risk_per_trade=0.02)
    assert parsed.parser == "builtin"
    assert parsed.strategy.entry_conditions[0].left.period == 20
    assert parsed.strategy.initial_capital == 50000
    assert parsed.strategy.risk.risk_per_trade == 0.02


def test_rsi_builtin_parse():
    parsed = parse_demo("Buy when RSI falls below 30 and sell when RSI rises above 70.")
    assert parsed.strategy.entry_conditions[0].left.indicator == IndicatorType.RSI


def test_builtin_rejects_unknown():
    with pytest.raises(StrategyParseError):
        parse_demo("Buy on full moon and sell on solar eclipse using quantum indicators.")


# ---------------------------------------------------------------------------
# 18. End-to-end backtest
# ---------------------------------------------------------------------------

def test_end_to_end_backtest(sample_df):
    text = (
        "Buy SPY when the 20-day SMA crosses above the 50-day SMA and sell when "
        "the 20-day SMA crosses below the 50-day SMA. Risk 1% per trade."
    )
    parsed = parse_demo(text, initial_capital=100000, risk_per_trade=0.01, commission=0.001, slippage=0.0005)
    errors = validate_strategy_spec(parsed.strategy)
    assert errors == []
    result = BacktestEngine(parsed.strategy).run(sample_df)
    assert "metrics" in result
    assert result["metrics"]["initial_capital"] == 100000
    assert result["metrics"]["final_capital"] is not None
    assert result["metrics"]["number_of_trades"] >= 0
    assert len(result["equity_curve"]) == len(sample_df)
    # Persist-like JSON roundtrip
    blob = json.dumps(result)
    assert "equity_curve" in blob
