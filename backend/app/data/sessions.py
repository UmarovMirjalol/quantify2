"""Intraday session filters (US RTH by default)."""

from __future__ import annotations

import pandas as pd

# US regular trading hours in exchange-local wall clock (no TZ convert — bars are naive).
RTH_START = (9, 30)
RTH_END = (16, 0)


def filter_session(
    df: pd.DataFrame,
    *,
    session: str = "rth",
    start: tuple[int, int] = RTH_START,
    end: tuple[int, int] = RTH_END,
) -> pd.DataFrame:
    """Keep only bars inside the session window. Daily bars pass through unchanged.

    ``session``:
      - ``all``: no filter
      - ``rth``: US regular hours 09:30–16:00
    """
    if session in ("all", "none", "") or df.empty or "date" not in df.columns:
        return df
    out = df.copy()
    ts = pd.to_datetime(out["date"], errors="coerce")
    # Daily / weekly: no intraday clock → keep.
    if not ((ts.dt.hour != 0) | (ts.dt.minute != 0) | (ts.dt.second != 0)).any():
        return out
    minutes = ts.dt.hour * 60 + ts.dt.minute
    lo = start[0] * 60 + start[1]
    hi = end[0] * 60 + end[1]
    mask = (minutes >= lo) & (minutes < hi)
    return out.loc[mask].reset_index(drop=True)
