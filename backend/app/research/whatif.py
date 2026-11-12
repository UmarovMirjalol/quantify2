"""'What if I had bought X': a lump sum and/or a monthly amount, valued on today's price."""

from __future__ import annotations

import time
from datetime import date
from typing import Any

import numpy as np
import pandas as pd

from app.data.market_fetcher import fetch_market_frame

BENCHMARK = "SPY"
MAX_POINTS = 400
_CACHE: dict[str, tuple[float, pd.Series, str]] = {}
_TTL = 6 * 3600


def _closes(ticker: str) -> tuple[pd.Series, str]:
    key = ticker.upper()
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < _TTL:
        return hit[1], hit[2]
    df, source = fetch_market_frame(key, history="max")
    px = pd.Series(pd.to_numeric(df["close"], errors="coerce").to_numpy(), index=pd.to_datetime(df["date"]))
    px = px[px > 0].dropna().sort_index()
    px = px[~px.index.duplicated(keep="last")]
    if len(px) < 2:
        raise ValueError(f"Not enough price history for '{ticker}'.")
    _CACHE[key] = (time.time(), px, source)
    return px, source


def _plan(px: pd.Series, start: pd.Timestamp, amount: float, monthly: float) -> dict[str, Any]:
    window = px[px.index >= start]
    if len(window) < 2:
        raise ValueError("Pick a start date at least a few days before today.")
    buys = pd.Series(0.0, index=window.index)
    buys.iloc[0] += amount
    if monthly > 0:
        months = window.index.to_period("M")
        first_of_month = ~pd.Series(months, index=window.index).duplicated().to_numpy()
        first_of_month[0] = amount <= 0
        buys[first_of_month] += monthly
    units = (buys / window).cumsum()
    value = units * window
    invested = buys.cumsum()
    peak = value.cummax()
    drawdown = float(((value - peak) / peak).min()) if amount > 0 else None
    years = max((window.index[-1] - window.index[0]).days / 365.25, 1e-9)
    final, paid = float(value.iloc[-1]), float(invested.iloc[-1])
    step = max(1, len(window) // MAX_POINTS)
    idx = list(range(0, len(window), step))
    if idx[-1] != len(window) - 1:
        idx.append(len(window) - 1)
    return {
        "start_date": window.index[0].date().isoformat(),
        "end_date": window.index[-1].date().isoformat(),
        "start_price": float(window.iloc[0]),
        "end_price": float(window.iloc[-1]),
        "invested": paid,
        "value": final,
        "gain": final - paid,
        "total_return": final / paid - 1 if paid > 0 else None,
        "cagr": (final / amount) ** (1 / years) - 1 if amount > 0 and monthly == 0 and final > 0 else None,
        "max_drawdown": drawdown,
        "series": [
            {"date": window.index[i].date().isoformat(), "value": round(float(value.iloc[i]), 2),
             "invested": round(float(invested.iloc[i]), 2)}
            for i in idx
        ],
    }


def what_if(ticker: str, start: date, amount: float, monthly: float = 0.0) -> dict[str, Any]:
    if amount <= 0 and monthly <= 0:
        raise ValueError("Enter an amount, a monthly amount, or both.")
    px, source = _closes(ticker)
    first = px.index[0]
    requested = pd.Timestamp(start)
    begin = max(requested, first)
    out: dict[str, Any] = {
        "ticker": ticker.upper(),
        "source": source,
        "first_available": first.date().isoformat(),
        "clipped": bool(requested < first),
        **_plan(px, begin, amount, monthly),
    }
    out["benchmark"] = None
    if ticker.upper() != BENCHMARK:
        try:
            bench, _ = _closes(BENCHMARK)
            bench_start = max(pd.Timestamp(out["start_date"]), bench.index[0])
            b = _plan(bench, bench_start, amount, monthly)
            out["benchmark"] = {"ticker": BENCHMARK, **{k: b[k] for k in ("start_date", "invested", "value", "gain", "total_return")},
                                "series": b["series"]}
        except Exception:  # noqa: BLE001
            out["benchmark"] = None
    out["value_if_cash"] = out["invested"]
    out["multiple"] = out["value"] / out["invested"] if out["invested"] else None
    if out["multiple"] is not None and not np.isfinite(out["multiple"]):
        out["multiple"] = None
    return out
