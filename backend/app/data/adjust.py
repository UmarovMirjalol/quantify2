"""Corporate-action helpers: back-adjust OHLCV from Yahoo adjclose factors."""

from __future__ import annotations

import pandas as pd


def adjust_ohlcv_from_adjclose(df: pd.DataFrame) -> pd.DataFrame:
    """Back-adjust open/high/low/close (and scale volume) using ``adj_close``.

    Factor = adj_close / close on each bar. Applied to the whole OHLC so historical
    bars stay continuous through splits. If ``adj_close`` is missing or identical
    to ``close``, the frame is returned unchanged (copy).
    """
    out = df.copy()
    if "adj_close" not in out.columns or "close" not in out.columns:
        return out
    close = pd.to_numeric(out["close"], errors="coerce")
    adj = pd.to_numeric(out["adj_close"], errors="coerce")
    valid = close.notna() & adj.notna() & (close.abs() > 1e-12)
    if not valid.any():
        return out.drop(columns=["adj_close"], errors="ignore")
    factor = (adj / close).where(valid, 1.0)
    # No meaningful adjustment.
    if float((factor - 1.0).abs().max()) < 1e-9:
        return out.drop(columns=["adj_close"], errors="ignore")
    for col in ("open", "high", "low", "close"):
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce") * factor
    if "volume" in out.columns:
        # Splits increase share count → raw volume must be scaled the other way.
        out["volume"] = pd.to_numeric(out["volume"], errors="coerce") / factor.replace(0, pd.NA)
    return out.drop(columns=["adj_close"], errors="ignore")


def ensure_adjusted(df: pd.DataFrame) -> pd.DataFrame:
    """Idempotent entry point used by loaders and fetchers."""
    if "adj_close" in df.columns:
        return adjust_ohlcv_from_adjclose(df)
    return df
