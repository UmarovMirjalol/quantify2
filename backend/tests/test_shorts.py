"""Short selling: a short earns on a decline, loses on a rally, and mirrors the long."""

import numpy as np
import pandas as pd

from app.backtesting.engine import BacktestEngine
from app.export.pine_generator import generate_pine_script
from app.llm.parser import parse_demo
from app.llm.schemas import StrategySpec


def _path(closes: list[float], wick: float = 0.5) -> pd.DataFrame:
    close = np.array(closes, dtype=float)
    open_ = np.roll(close, 1)
    open_[0] = close[0]
    return pd.DataFrame(
        {
            "date": pd.bdate_range("2024-01-02", periods=len(close)),
            "open": open_,
            "high": np.maximum(open_, close) + wick,
            "low": np.minimum(open_, close) - wick,
            "close": close,
            "volume": np.full(len(close), 1_000_000),
        }
    )


def _spec(side: str, exit_below: float, **extra) -> StrategySpec:
    return StrategySpec.model_validate(
        {
            "asset": "TEST",
            "side": side,
            "initial_capital": 100000,
            "entry_conditions": [
                {"left": {"indicator": "PRICE", "component": "close"}, "operator": "greater_than", "right": 0}
            ],
            "exit_conditions": [
                {"left": {"indicator": "PRICE", "component": "close"}, "operator": "less_than", "right": exit_below}
            ],
            "risk": {"percent_capital": 0.5},
            "position_sizing": "percent_capital",
            "commission": 0.0,
            "slippage": 0.0,
            **extra,
        }
    )


def test_short_profits_from_a_decline_and_books_cash_correctly():
    df = _path([100.0] * 5 + list(np.linspace(100, 70, 20)))
    result = BacktestEngine(_spec("short", exit_below=75)).run(df)

    trade = result["trades"][0]
    assert trade["side"] == "short"
    assert trade["exit_price"] < trade["entry_price"]
    assert trade["pnl"] > 0
    assert trade["return_pct"] > 0
    expected = (trade["entry_price"] - trade["exit_price"]) * trade["quantity"]
    assert abs(trade["pnl"] - expected) < 1e-6
    assert abs(result["equity_curve"][-1]["equity"] - (100000 + sum(t["pnl"] for t in result["trades"]))) < 1e-6


def test_short_stop_fires_above_entry_on_a_rally():
    df = _path([100.0] * 5 + list(np.linspace(100, 130, 20)))
    result = BacktestEngine(_spec("short", exit_below=1, stop_loss=0.05)).run(df)

    trade = result["trades"][0]
    assert trade["exit_reason"] == "stop_loss"
    assert trade["exit_price"] > trade["entry_price"]
    assert trade["pnl"] < 0


def test_short_is_the_mirror_of_the_long_on_the_same_path():
    df = _path([100.0] * 5 + list(np.linspace(100, 80, 15)))
    long_trade = BacktestEngine(_spec("long", exit_below=85)).run(df)["trades"][0]
    short_trade = BacktestEngine(_spec("short", exit_below=85)).run(df)["trades"][0]

    assert long_trade["entry_date"] == short_trade["entry_date"]
    assert long_trade["exit_date"] == short_trade["exit_date"]
    assert long_trade["quantity"] == short_trade["quantity"]
    assert abs(long_trade["pnl"] + short_trade["pnl"]) < 1e-6


def test_parser_reads_short_language_and_flips_the_rule():
    text = (
        "Short SPY when the 20-day SMA crosses below the 50-day SMA, "
        "cover when it crosses back above. Risk 1% per trade."
    )
    strategy = parse_demo(text, initial_capital=100000).strategy
    assert strategy.side.value == "short"
    assert strategy.asset == "SPY"
    assert strategy.entry_conditions[0].condition.value == "cross_below"
    assert strategy.exit_conditions[0].condition.value == "cross_above"

    long_strategy = parse_demo("Buy SPY when the 20-day SMA crosses above the 50-day SMA.").strategy
    assert long_strategy.side.value == "long"


def test_pine_export_uses_short_direction_and_inverted_brackets():
    strategy = _spec("short", exit_below=75, stop_loss=0.05, take_profit=0.1)
    pine = generate_pine_script(strategy)
    assert "strategy.short" in pine
    assert "(1.0 + 0.05)" in pine
    assert "(1.0 - 0.1)" in pine
