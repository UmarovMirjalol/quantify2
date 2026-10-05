"""Interpret structured StrategySpec into boolean signal series."""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.backtesting.indicators import compute_indicator_series
from app.llm.schemas import Condition, ConditionOp, LogicOp, StrategySpec


def _resolve_side(df: pd.DataFrame, side: object) -> pd.Series:
    if isinstance(side, (int, float)):
        return pd.Series(float(side), index=df.index, dtype=float)
    # IndicatorRef
    return compute_indicator_series(
        df,
        side.indicator.value if hasattr(side.indicator, "value") else str(side.indicator),
        period=side.period,
        fast_period=side.fast_period,
        slow_period=side.slow_period,
        signal_period=side.signal_period,
        std_dev=side.std_dev,
        component=side.component,
    )


def evaluate_condition(df: pd.DataFrame, condition: Condition) -> pd.Series:
    """
    Evaluate a condition into a boolean Series aligned to df.index.

    Cross conditions use only current and previous bar values (no look-ahead).
    """
    left = _resolve_side(df, condition.left)
    right = _resolve_side(df, condition.right)
    op = condition.operator

    if op == ConditionOp.GREATER_THAN:
        return left > right
    if op == ConditionOp.LESS_THAN:
        return left < right
    if op == ConditionOp.EQUALS:
        return np.isclose(left, right, rtol=0.0, atol=1e-8, equal_nan=False)
    if op == ConditionOp.CROSS_ABOVE:
        prev_left = left.shift(1)
        prev_right = right.shift(1)
        return (prev_left <= prev_right) & (left > right)
    if op == ConditionOp.CROSS_BELOW:
        prev_left = left.shift(1)
        prev_right = right.shift(1)
        return (prev_left >= prev_right) & (left < right)

    raise ValueError(f"Unsupported operator: {op}")


def combine_signals(signals: list[pd.Series], logic: LogicOp) -> pd.Series:
    if not signals:
        raise ValueError("No signals to combine")
    result = signals[0].fillna(False).astype(bool)
    for sig in signals[1:]:
        s = sig.fillna(False).astype(bool)
        if logic == LogicOp.AND:
            result = result & s
        else:
            result = result | s
    return result


def generate_signals(df: pd.DataFrame, strategy: StrategySpec) -> tuple[pd.Series, pd.Series]:
    """
    Generate entry and exit signal series from a strategy specification.

    Signals at bar t use only data available at or before bar t.
    Execution is deferred to the next bar's open by the backtesting engine.
    """
    entry_parts = [evaluate_condition(df, c) for c in strategy.entry_conditions]
    exit_parts = [evaluate_condition(df, c) for c in strategy.exit_conditions]
    entries = combine_signals(entry_parts, strategy.entry_logic)
    exits = combine_signals(exit_parts, strategy.exit_logic)
    # Cannot trade when indicators are NaN (warmup)
    valid = df["close"].notna()
    for c in strategy.entry_conditions + strategy.exit_conditions:
        left = _resolve_side(df, c.left)
        valid = valid & left.notna()
        if not isinstance(c.right, (int, float)):
            right = _resolve_side(df, c.right)
            valid = valid & right.notna()
    entries = entries & valid
    exits = exits & valid
    return entries.astype(bool), exits.astype(bool)


def validate_strategy_spec(strategy: StrategySpec) -> list[str]:
    """Return a list of validation errors for a strategy spec (empty if valid)."""
    errors: list[str] = []
    try:
        # Re-validate via model copy
        StrategySpec.model_validate(strategy.model_dump())
    except Exception as exc:  # noqa: BLE001
        errors.append(str(exc))

    supported = {"SMA", "EMA", "RSI", "MACD", "BOLLINGER", "ATR", "PRICE"}
    for cond in strategy.entry_conditions + strategy.exit_conditions:
        for side_name in ("left", "right"):
            side = getattr(cond, side_name)
            if isinstance(side, (int, float)):
                continue
            ind = side.indicator.value if hasattr(side.indicator, "value") else str(side.indicator)
            if ind not in supported:
                errors.append(f"Unsupported indicator: {ind}")
            if ind in ("SMA", "EMA", "RSI", "ATR") and (side.period is None or side.period < 1):
                errors.append(f"{ind} period must be >= 1")
            if ind in ("SMA", "EMA") and side.period and side.period > 500:
                errors.append(f"{ind} period too large")

    if strategy.risk.risk_per_trade <= 0 or strategy.risk.risk_per_trade > 1:
        errors.append("risk_per_trade must be in (0, 1]")
    if strategy.stop_loss is not None and (strategy.stop_loss <= 0 or strategy.stop_loss > 0.5):
        errors.append("stop_loss must be in (0, 0.5]")
    if strategy.take_profit is not None and strategy.take_profit <= 0:
        errors.append("take_profit must be positive")
    if strategy.initial_capital <= 0:
        errors.append("initial_capital must be positive")
    if not strategy.entry_conditions:
        errors.append("At least one entry condition required")
    if not strategy.exit_conditions:
        errors.append("At least one exit condition required")
    return errors
