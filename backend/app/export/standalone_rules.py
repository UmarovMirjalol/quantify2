"""Rule interpreter for exported scripts: works on the plain-JSON strategy spec.

Only the code between the standalone markers is copied into exported scripts, next to
the verbatim indicator module, so it may use nothing but numpy, pandas and those helpers.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.backtesting.indicators import compute_indicator_series

# --- standalone:start ---
TIMEFRAME_RULES = {"1m": "1min", "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1D", "1D": "1D", "1w": "1W"}


def resample_ohlcv(df, timeframe):
    rule = TIMEFRAME_RULES.get(timeframe)
    if not rule:
        return df
    data = df.copy()
    data["_dt"] = pd.to_datetime(data["date"], errors="coerce")
    if data["_dt"].isna().all():
        return df
    data = data.dropna(subset=["_dt"]).set_index("_dt").sort_index()
    out = (
        data.resample(rule, label="right", closed="right")
        .agg({"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"})
        .dropna()
        .reset_index()
    )
    out["date"] = out["_dt"].astype(str)
    return out


def _indicator(df, ref):
    return compute_indicator_series(
        df,
        ref["indicator"],
        period=ref.get("period"),
        fast_period=ref.get("fast_period"),
        slow_period=ref.get("slow_period"),
        signal_period=ref.get("signal_period"),
        std_dev=ref.get("std_dev"),
        component=ref.get("component") or "value",
        bar_factor=ref.get("bar_factor"),
    )


def resolve_side(df, side):
    if isinstance(side, (int, float)):
        return pd.Series(float(side), index=df.index, dtype=float)
    if side.get("timeframe") and "date" in df.columns:
        htf = resample_ohlcv(df, side["timeframe"])
        if 0 < len(htf) < len(df):
            values = _indicator(htf, {**side, "bar_factor": None})
            base = pd.DataFrame({"_dt": pd.to_datetime(df["date"]), "_idx": df.index})
            aligned = pd.DataFrame({"_dt": pd.to_datetime(htf["date"]), "_val": values})
            merged = pd.merge_asof(base.sort_values("_dt"), aligned.sort_values("_dt"), on="_dt", direction="backward")
            merged = merged.sort_values("_idx")
            return pd.Series(merged["_val"].values, index=df.index, dtype=float)
    return _indicator(df, side)


def evaluate_condition(df, cond):
    left = resolve_side(df, cond["left"])
    right = resolve_side(df, cond["right"])
    op = cond["operator"]
    if op == "greater_than":
        return left > right
    if op == "less_than":
        return left < right
    if op == "equals":
        return pd.Series(np.isclose(left, right, rtol=0.0, atol=1e-8, equal_nan=False), index=df.index)
    if op == "cross_above":
        return (left.shift(1) <= right.shift(1)) & (left > right)
    if op == "cross_below":
        return (left.shift(1) >= right.shift(1)) & (left < right)
    raise ValueError(f"Unsupported operator: {op}")


def _combine(parts, logic):
    out = parts[0].fillna(False).astype(bool)
    for part in parts[1:]:
        part = part.fillna(False).astype(bool)
        out = (out & part) if logic == "AND" else (out | part)
    return out


def rule_signals(df, spec):
    """Entry/exit flags from the spec's conditions; bars with warming-up indicators never trade."""
    conds = spec["entry_conditions"] + spec["exit_conditions"]
    entry = _combine([evaluate_condition(df, c) for c in spec["entry_conditions"]], spec.get("entry_logic", "AND"))
    exit_ = _combine([evaluate_condition(df, c) for c in spec["exit_conditions"]], spec.get("exit_logic", "AND"))
    valid = df["close"].notna()
    for c in conds:
        valid = valid & resolve_side(df, c["left"]).notna()
        if not isinstance(c["right"], (int, float)):
            valid = valid & resolve_side(df, c["right"]).notna()
    return (entry & valid).astype(bool), (exit_ & valid).astype(bool)
# --- standalone:end ---


def signals_for(df: pd.DataFrame, spec: dict[str, Any]) -> tuple[pd.Series, pd.Series]:
    return rule_signals(df, spec)
