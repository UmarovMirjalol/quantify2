"""Universe / ticker data health: coverage, gaps, adj_close presence."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import numpy as np
import pandas as pd

from app.data.market_fetcher import fetch_market_frame
from app.research.screener import UNIVERSES

WORKERS = 8
MAX_PROBE = 40


def _gap_stats(dates: pd.Series, *, daily: bool = True) -> dict[str, Any]:
    ts = pd.to_datetime(dates, errors="coerce").dropna().sort_values()
    if len(ts) < 5:
        return {"gaps": 0, "max_gap_days": 0, "median_gap_days": None}
    deltas = ts.diff().dt.total_seconds().dropna() / 86400.0
    # Weekends inflate daily gaps; flag only multi-day holes beyond 4 calendar days for daily.
    threshold = 4.0 if daily else 2.0 / 24.0
    holes = deltas[deltas > threshold]
    return {
        "gaps": int(len(holes)),
        "max_gap_days": None if holes.empty else round(float(holes.max()), 2),
        "median_gap_days": None if deltas.empty else round(float(np.median(deltas)), 3),
    }


def probe_ticker(ticker: str, *, history: str = "1y") -> dict[str, Any]:
    symbol = ticker.strip().upper()
    try:
        df, source = fetch_market_frame(symbol, history=history)
    except Exception as exc:  # noqa: BLE001
        return {
            "ticker": symbol,
            "ok": False,
            "error": str(exc)[:160],
            "bars": 0,
            "source": None,
            "has_adj_close": False,
            "gaps": None,
            "date_start": None,
            "date_end": None,
            "grade": "fail",
        }
    has_adj = "adj_close" in df.columns and df["adj_close"].notna().any()
    # After ensure_adjusted, adj may already be folded into OHLC — still report raw presence if column exists.
    gaps = _gap_stats(df["date"])
    bars = int(len(df))
    grade = "ok"
    if bars < 60:
        grade = "thin"
    elif gaps["gaps"] and gaps["gaps"] > 8:
        grade = "warn"
    elif gaps["max_gap_days"] and gaps["max_gap_days"] > 14:
        grade = "warn"
    return {
        "ticker": symbol,
        "ok": True,
        "error": None,
        "bars": bars,
        "source": source,
        "has_adj_close": bool(has_adj),
        "gaps": gaps["gaps"],
        "max_gap_days": gaps["max_gap_days"],
        "median_gap_days": gaps["median_gap_days"],
        "date_start": str(df["date"].iloc[0])[:10],
        "date_end": str(df["date"].iloc[-1])[:10],
        "grade": grade,
    }


def universe_health(
    *,
    universe: str | None = "etfs",
    tickers: list[str] | None = None,
    history: str = "1y",
    max_symbols: int = MAX_PROBE,
) -> dict[str, Any]:
    symbols: list[str] = []
    if universe:
        if universe not in UNIVERSES:
            raise ValueError(f"Unknown universe: {universe}")
        symbols.extend(UNIVERSES[universe]["tickers"])
    symbols.extend(t.strip().upper() for t in (tickers or []) if t.strip())
    symbols = list(dict.fromkeys(symbols))[: max(1, min(max_symbols, MAX_PROBE))]
    if not symbols:
        raise ValueError("Pick a universe or tickers.")

    rows: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=min(WORKERS, len(symbols))) as pool:
        futs = {pool.submit(probe_ticker, s, history=history): s for s in symbols}
        for fut in as_completed(futs):
            rows.append(fut.result())
    rows.sort(key=lambda r: (r.get("grade") != "fail", r.get("ticker") or ""))
    ok = sum(1 for r in rows if r.get("ok"))
    warn = sum(1 for r in rows if r.get("grade") == "warn")
    fail = sum(1 for r in rows if r.get("grade") == "fail")
    thin = sum(1 for r in rows if r.get("grade") == "thin")
    return {
        "universe": universe,
        "history": history,
        "scanned": len(rows),
        "ok": ok,
        "warn": warn,
        "thin": thin,
        "fail": fail,
        "rows": rows,
    }
