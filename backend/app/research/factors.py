"""Simple factor exposure: OLS beta / alpha of strategy equity vs a benchmark price series."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def align_returns(strategy_equity: list[dict[str, Any]], benchmark: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    s = pd.DataFrame(strategy_equity)
    if s.empty or benchmark.empty:
        return np.array([]), np.array([])
    s["date"] = pd.to_datetime(s["date"])
    b = benchmark[["date", "close"]].copy()
    b["date"] = pd.to_datetime(b["date"])
    m = pd.merge(s[["date", "equity"]], b, on="date", how="inner").dropna()
    if len(m) < 30:
        return np.array([]), np.array([])
    sr = m["equity"].pct_change()
    br = m["close"].pct_change()
    ok = sr.notna() & br.notna()
    return sr[ok].to_numpy(dtype=float), br[ok].to_numpy(dtype=float)


def ols_beta_alpha(y: np.ndarray, x: np.ndarray) -> dict[str, float | None]:
    if y.size < 30 or x.size != y.size:
        return {"beta": None, "alpha_daily": None, "alpha_annual": None, "r2": None, "n": int(y.size)}
    x1 = np.column_stack([np.ones(len(x)), x])
    coef, *_ = np.linalg.lstsq(x1, y, rcond=None)
    alpha, beta = float(coef[0]), float(coef[1])
    pred = x1 @ coef
    ss_res = float(np.sum((y - pred) ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2)) or 1.0
    r2 = 1.0 - ss_res / ss_tot
    return {
        "beta": round(beta, 4),
        "alpha_daily": round(alpha, 6),
        "alpha_annual": round(alpha * 252, 4),
        "r2": round(r2, 4),
        "n": int(y.size),
    }


def factor_report(strategy_equity: list[dict[str, Any]], benchmark: pd.DataFrame, name: str = "SPY") -> dict[str, Any]:
    y, x = align_returns(strategy_equity, benchmark)
    stats = ols_beta_alpha(y, x)
    return {"benchmark": name, **stats}


DEFAULT_BENCHMARKS = ("SPY", "QQQ", "IWM", "TLT", "GLD")


def multi_factor_report(
    strategy_equity: list[dict[str, Any]],
    frames: dict[str, pd.DataFrame],
) -> dict[str, Any]:
    """OLS beta/alpha vs several benchmarks for a tearsheet grid."""
    rows: list[dict[str, Any]] = []
    for name, df in frames.items():
        rows.append(factor_report(strategy_equity, df, name=name.upper()))
    rows.sort(key=lambda r: (-(r.get("r2") or -1), r.get("benchmark") or ""))
    best = next((r for r in rows if r.get("r2") is not None), None)
    return {
        "benchmarks": list(frames.keys()),
        "rows": rows,
        "best_fit": None if best is None else best.get("benchmark"),
        "count": len(rows),
    }
