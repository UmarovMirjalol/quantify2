"""Interpret structured StrategySpec into boolean signal series."""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.backtesting.indicators import compute_indicator_series
from app.llm.schemas import Condition, ConditionOp, LogicOp, StrategySpec


def resample_ohlcv(df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    """Resample OHLCV dataframe to a higher timeframe."""
    tf_map = {
        "1m": "1min",
        "5m": "5min",
        "15m": "15min",
        "1h": "1h",
        "4h": "4h",
        "1d": "1D",
        "1D": "1D",
        "1w": "1W",
    }
    rule = tf_map.get(timeframe)
    if not rule:
        return df

    data = df.copy()
    data["_dt"] = pd.to_datetime(data["date"], errors="coerce")
    if data["_dt"].isna().all():
        return df
    data = data.dropna(subset=["_dt"]).set_index("_dt").sort_index()

    resampled = (
        data.resample(rule, label="right", closed="right")
        .agg(
            {
                "open": "first",
                "high": "max",
                "low": "min",
                "close": "last",
                "volume": "sum",
            }
        )
        .dropna()
        .reset_index()
    )

    resampled["date"] = resampled["_dt"].astype(str)
    return resampled


def _resolve_side(df: pd.DataFrame, side: object) -> pd.Series:
    if isinstance(side, (int, float)):
        return pd.Series(float(side), index=df.index, dtype=float)

    # Multi-timeframe handling: if side has a specific higher timeframe
    if getattr(side, "timeframe", None) and "date" in df.columns:
        htf_df = resample_ohlcv(df, side.timeframe)
        if 0 < len(htf_df) < len(df):
            htf_series = compute_indicator_series(
                htf_df,
                side.indicator.value if hasattr(side.indicator, "value") else str(side.indicator),
                period=side.period,
                fast_period=side.fast_period,
                slow_period=side.slow_period,
                signal_period=side.signal_period,
                std_dev=side.std_dev,
                component=side.component,
            )
            base_dates = pd.DataFrame({"_dt": pd.to_datetime(df["date"]), "_idx": df.index})
            htf_aligned = pd.DataFrame({"_dt": pd.to_datetime(htf_df["date"]), "_val": htf_series})
            merged = pd.merge_asof(
                base_dates.sort_values("_dt"),
                htf_aligned.sort_values("_dt"),
                on="_dt",
                direction="backward",
            )
            merged = merged.sort_values("_idx")
            return pd.Series(merged["_val"].values, index=df.index, dtype=float)

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
        bar_factor=getattr(side, "bar_factor", None),
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
        return pd.Series(
            np.isclose(left, right, rtol=0.0, atol=1e-8, equal_nan=False),
            index=df.index,
        )
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


def all_conditions(strategy: StrategySpec) -> list[Condition]:
    return strategy.entry_conditions + strategy.entry_any + strategy.exit_conditions + strategy.exit_any


def generate_signals(df: pd.DataFrame, strategy: StrategySpec) -> tuple[pd.Series, pd.Series]:
    """
    Generate entry and exit signal series from a strategy specification.

    Signals at bar t use only data available at or before bar t.
    Execution is deferred to the next bar's open by the backtesting engine.
    """
    if strategy.is_custom:
        from app.strategies.sandbox import run_custom

        custom = run_custom(strategy.custom_code or "", df)
        return pd.Series(custom.entry, index=df.index), pd.Series(custom.exit, index=df.index)
    entry_parts = [evaluate_condition(df, c) for c in strategy.entry_conditions]
    exit_parts = [evaluate_condition(df, c) for c in strategy.exit_conditions]
    entries = combine_signals(entry_parts, strategy.entry_logic)
    exits = combine_signals(exit_parts, strategy.exit_logic)
    if strategy.entry_any:
        entries = entries & combine_signals([evaluate_condition(df, c) for c in strategy.entry_any], LogicOp.OR)
    if strategy.exit_any:
        exits = exits & combine_signals([evaluate_condition(df, c) for c in strategy.exit_any], LogicOp.OR)
    # Cannot trade when indicators are NaN (warmup)
    valid = df["close"].notna()
    for c in all_conditions(strategy):
        left = _resolve_side(df, c.left)
        valid = valid & left.notna()
        if not isinstance(c.right, (int, float)):
            right = _resolve_side(df, c.right)
            valid = valid & right.notna()
    entries = entries & valid
    exits = exits & valid
    return entries.astype(bool), exits.astype(bool)


_OP_WORDS = {
    ConditionOp.GREATER_THAN: "above",
    ConditionOp.LESS_THAN: "below",
    ConditionOp.CROSS_ABOVE: "crossed above",
    ConditionOp.CROSS_BELOW: "crossed below",
    ConditionOp.EQUALS: "=",
}
_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _ref_label(ref: object) -> str:
    ind = ref.indicator.value if hasattr(ref.indicator, "value") else str(ref.indicator)
    comp, period = ref.component, ref.period
    if ind == "PRICE":
        label = comp.capitalize()
    elif ind == "MACD":
        label = {"signal": "MACD signal", "histogram": "MACD histogram"}.get(comp, "MACD")
    elif ind == "BOLLINGER":
        label = f"Bollinger {comp} band"
    elif ind == "STOCH":
        label = f"Stochastic %{'D' if comp == 'd' else 'K'}"
    elif ind == "ADX":
        label = {"plus": "+DI", "minus": "-DI"}.get(comp, "ADX")
    elif ind == "DONCHIAN":
        label = f"{period}-bar {'low' if comp == 'lower' else 'mid' if comp == 'middle' else 'high'}"
    elif ind == "CHANGE":
        label = f"{period}-bar change %"
    elif ind == "VOLUME":
        label = f"Volume SMA({period})" if comp == "sma" else "Volume"
    elif ind in ("HAMMER", "PINBAR", "ENGULFING"):
        label = f"{'Bearish' if comp == 'bearish' else 'Bullish'} {ind.lower().replace('pinbar', 'pin bar')}"
    elif period:
        label = f"{ind}({period})"
    else:
        label = ind
    tf = getattr(ref, "timeframe", None)
    return f"{label} [{tf}]" if tf else label


def _fmt(v: float) -> str:
    return f"{v:,.2f}" if abs(v) >= 1 else f"{v:.4f}"


class ConditionExplainer:
    """Plain-English reasons for which rules were true on a given bar."""

    def __init__(self, df: pd.DataFrame, strategy: StrategySpec):
        self.parts = {
            side: [
                (c, evaluate_condition(df, c), _resolve_side(df, c.left), _resolve_side(df, c.right))
                for c in conds
            ]
            for side, conds in (
                ("entry", strategy.entry_conditions + strategy.entry_any),
                ("exit", strategy.exit_conditions + strategy.exit_any),
            )
        }

    def why(self, side: str, i: int) -> str:
        if i < 0:
            return ""
        lines = []
        for cond, hit, left, right in self.parts.get(side, []):
            if i >= len(hit) or not bool(hit.iloc[i]):
                continue
            ind = cond.left.indicator.value
            lv, rv = float(left.iloc[i]), float(right.iloc[i])
            if ind in ("HAMMER", "PINBAR", "ENGULFING"):
                lines.append(f"{_ref_label(cond.left)} candle")
            elif ind == "CHANGE" and isinstance(cond.right, (int, float)):
                bars = cond.left.period or 1
                lines.append(
                    f"Price change over {bars} bar{'s' if bars > 1 else ''} {lv:.2f}% "
                    f"{_OP_WORDS[cond.operator]} {rv:.2f}%"
                )
            elif ind == "WEEKDAY":
                lines.append(
                    f"{'Next session' if cond.left.component == 'next' else 'Day'} is {_DAYS[int(rv) % 7]}"
                )
            else:
                rlabel = _fmt(rv) if isinstance(cond.right, (int, float)) else f"{_ref_label(cond.right)} {_fmt(rv)}"
                lines.append(f"{_ref_label(cond.left)} {_fmt(lv)} {_OP_WORDS[cond.operator]} {rlabel}")
        return "; ".join(lines)


def validate_strategy_spec(strategy: StrategySpec) -> list[str]:
    """Return a list of validation errors for a strategy spec (empty if valid)."""
    errors: list[str] = []
    try:
        # Re-validate via model copy
        StrategySpec.model_validate(strategy.model_dump())
    except Exception as exc:  # noqa: BLE001
        errors.append(str(exc))

    supported = {
        "SMA",
        "EMA",
        "RSI",
        "MACD",
        "BOLLINGER",
        "ATR",
        "PRICE",
        "VOLUME",
        "VWAP",
        "OBV",
        "HAMMER",
        "PINBAR",
        "ENGULFING",
        "STOCH",
        "ADX",
        "DONCHIAN",
        "WEEKDAY",
        "CHANGE",
    }
    for cond in all_conditions(strategy):
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
    if strategy.is_custom:
        from app.strategies.sandbox import validate_code

        errors.extend(validate_code(strategy.custom_code or ""))
        return errors
    if not strategy.entry_conditions:
        errors.append("At least one entry condition required")
    if not strategy.exit_conditions:
        errors.append("At least one exit condition required")
    return errors
