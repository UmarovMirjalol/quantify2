"""Simple factor exposure: OLS beta / alpha of strategy equity vs a benchmark price series."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def _merged(strategy_equity: list[dict[str, Any]], benchmark: pd.DataFrame) -> pd.DataFrame:
    s = pd.DataFrame(strategy_equity)
    if s.empty or benchmark.empty:
        return pd.DataFrame()
    s["date"] = pd.to_datetime(s["date"])
    b = benchmark[["date", "close"]].copy()
    b["date"] = pd.to_datetime(b["date"])
    m = pd.merge(s[["date", "equity"]], b, on="date", how="inner").dropna()
    if len(m) < 30:
        return pd.DataFrame()
    m["sr"] = m["equity"].pct_change()
    m["br"] = m["close"].pct_change()
    return m.dropna(subset=["sr", "br"]).reset_index(drop=True)


def align_returns(strategy_equity: list[dict[str, Any]], benchmark: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    m = _merged(strategy_equity, benchmark)
    if m.empty:
        return np.array([]), np.array([])
    return m["sr"].to_numpy(dtype=float), m["br"].to_numpy(dtype=float)


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


def _rolling_ols(y: np.ndarray, x: np.ndarray, dates: list[str], window: int = 63) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if y.size < window or x.size != y.size:
        return out
    for i in range(window - 1, len(y)):
        ys = y[i - window + 1 : i + 1]
        xs = x[i - window + 1 : i + 1]
        stats = ols_beta_alpha(ys, xs)
        if stats["beta"] is None:
            continue
        out.append(
            {
                "date": dates[i],
                "beta": stats["beta"],
                "alpha_annual": stats["alpha_annual"],
                "r2": stats["r2"],
            }
        )
    return out


def _residual_equity(m: pd.DataFrame, beta: float, alpha_daily: float) -> list[dict[str, Any]]:
    """Compound residual returns (strategy − α − β·bench) from 10_000."""
    if m.empty or beta is None:
        return []
    start = 10_000.0
    eq = start
    path: list[dict[str, Any]] = [{"date": m.iloc[0]["date"].strftime("%Y-%m-%d"), "equity": start}]
    for _, row in m.iloc[1:].iterrows():
        resid = float(row["sr"]) - float(alpha_daily) - float(beta) * float(row["br"])
        eq *= 1.0 + resid
        path.append({"date": row["date"].strftime("%Y-%m-%d"), "equity": round(eq, 2)})
    return path


def factor_report(
    strategy_equity: list[dict[str, Any]],
    benchmark: pd.DataFrame,
    name: str = "SPY",
    *,
    detail: bool = False,
    rolling_window: int = 63,
) -> dict[str, Any]:
    m = _merged(strategy_equity, benchmark)
    if m.empty:
        return {
            "benchmark": name,
            "beta": None,
            "alpha_daily": None,
            "alpha_annual": None,
            "r2": None,
            "n": 0,
        }
    y = m["sr"].to_numpy(dtype=float)
    x = m["br"].to_numpy(dtype=float)
    stats = ols_beta_alpha(y, x)
    out: dict[str, Any] = {"benchmark": name, **stats}
    if detail and stats["beta"] is not None and stats["alpha_daily"] is not None:
        dates = [d.strftime("%Y-%m-%d") for d in m["date"]]
        out["residual_equity"] = _residual_equity(m, float(stats["beta"]), float(stats["alpha_daily"]))
        out["rolling"] = _rolling_ols(y, x, dates, window=max(30, int(rolling_window)))
        # Benchmark-normalized strategy equity (start matched)
        start_eq = float(m.iloc[0]["equity"]) or 1.0
        start_px = float(m.iloc[0]["close"]) or 1.0
        out["aligned_equity"] = [
            {
                "date": d.strftime("%Y-%m-%d"),
                "equity": round(float(eq), 2),
                "benchmark": round(start_eq * (float(px) / start_px), 2),
            }
            for d, eq, px in zip(m["date"], m["equity"], m["close"], strict=False)
        ]
    return out


DEFAULT_BENCHMARKS = ("SPY", "QQQ", "IWM", "TLT", "GLD")


def multi_factor_report(
    strategy_equity: list[dict[str, Any]],
    frames: dict[str, pd.DataFrame],
) -> dict[str, Any]:
    """OLS beta/alpha vs several benchmarks for a tearsheet grid."""
    rows: list[dict[str, Any]] = []
    for name, df in frames.items():
        rows.append(factor_report(strategy_equity, df, name=name.upper(), detail=False))
    rows.sort(key=lambda r: (-(r.get("r2") or -1), r.get("benchmark") or ""))
    best = next((r for r in rows if r.get("r2") is not None), None)
    return {
        "benchmarks": list(frames.keys()),
        "rows": rows,
        "best_fit": None if best is None else best.get("benchmark"),
        "count": len(rows),
    }
