"""Bar frequency helpers and strategy-timeframe alignment."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.strategies.interpreter import resample_ohlcv

# Nominal seconds per strategy timeframe label.
TF_SECONDS: dict[str, int] = {
    "1m": 60,
    "5m": 5 * 60,
    "15m": 15 * 60,
    "1h": 60 * 60,
    "4h": 4 * 60 * 60,
    "1d": 24 * 60 * 60,
    "1D": 24 * 60 * 60,
    "1w": 7 * 24 * 60 * 60,
}


def infer_bar_seconds(df: pd.DataFrame) -> float | None:
    """Median gap between timestamps in seconds; None if unreadable."""
    if "date" not in df.columns or len(df) < 3:
        return None
    ts = pd.to_datetime(df["date"], errors="coerce").dropna()
    if len(ts) < 3:
        return None
    deltas = ts.sort_values().diff().dt.total_seconds().dropna()
    deltas = deltas[deltas > 0]
    if deltas.empty:
        return None
    return float(deltas.median())


def infer_timeframe_label(bar_seconds: float | None) -> str:
    if bar_seconds is None:
        return "unknown"
    best = "1d"
    best_diff = float("inf")
    for label, sec in TF_SECONDS.items():
        if label == "1D":
            continue
        diff = abs(bar_seconds - sec)
        if diff < best_diff:
            best, best_diff = label, diff
    return best


def align_to_timeframe(df: pd.DataFrame, timeframe: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Resample ``df`` up to ``timeframe`` when the data is finer.

    Returns the (possibly resampled) frame and a small metadata dict for the result payload.
    If the data is coarser than requested, the original frame is kept and a warning is set.
    """
    tf = timeframe if timeframe != "1D" else "1d"
    target = TF_SECONDS.get(tf)
    source_sec = infer_bar_seconds(df)
    source_label = infer_timeframe_label(source_sec)
    meta: dict[str, Any] = {
        "requested": tf,
        "source": source_label,
        "source_bars": int(len(df)),
        "applied": source_label,
        "resampled": False,
        "warning": None,
    }
    if target is None or source_sec is None:
        return df, meta

    # Already at the target (within 20% tolerance) — leave as-is.
    if abs(source_sec - target) / target <= 0.2:
        meta["applied"] = tf
        return df, meta

    # Data finer than strategy timeframe → aggregate completed bars.
    if source_sec < target * 0.8:
        out = resample_ohlcv(df, tf)
        if len(out) >= 5:
            meta.update(
                {
                    "applied": tf,
                    "resampled": True,
                    "result_bars": int(len(out)),
                }
            )
            return out.reset_index(drop=True), meta
        meta["warning"] = f"Could not resample {source_label} → {tf}; using source bars."
        return df, meta

    # Data coarser than requested — cannot invent finer bars.
    meta["warning"] = (
        f"Data looks like {source_label} bars; cannot simulate {tf}. "
        f"Running on the source timeframe."
    )
    return df, meta
