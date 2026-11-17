"""Portfolio risk: historical VaR / Expected Shortfall and simple margin usage."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def equity_returns(equity: list[float] | pd.Series) -> np.ndarray:
    s = pd.Series(equity, dtype=float)
    r = s.pct_change().dropna().to_numpy(dtype=float)
    return r[np.isfinite(r)]


def historical_var_es(returns: np.ndarray, alpha: float = 0.95) -> dict[str, float | None]:
    """Left-tail VaR / ES on daily returns. Values are negative for losses."""
    if returns.size < 30:
        return {"var": None, "es": None, "alpha": alpha, "n": int(returns.size)}
    q = float(np.quantile(returns, 1.0 - alpha))
    tail = returns[returns <= q]
    es = float(tail.mean()) if tail.size else q
    return {
        "var": round(q, 6),
        "es": round(es, 6),
        "alpha": alpha,
        "n": int(returns.size),
        "var_pct": round(q * 100, 3),
        "es_pct": round(es * 100, 3),
    }


def margin_usage(equity_curve: list[dict[str, Any]]) -> dict[str, float | None]:
    """Approx invested fraction when curve carries cash."""
    if not equity_curve:
        return {"avg_invested": None, "max_invested": None, "avg_cash_share": None}
    invested = []
    cash_share = []
    for row in equity_curve:
        eq = float(row.get("equity") or 0)
        cash = row.get("cash")
        if cash is None or eq <= 0:
            continue
        cash_f = float(cash)
        inv = max(0.0, eq - cash_f) / eq
        invested.append(inv)
        cash_share.append(cash_f / eq)
    if not invested:
        return {"avg_invested": None, "max_invested": None, "avg_cash_share": None}
    return {
        "avg_invested": round(float(np.mean(invested)), 4),
        "max_invested": round(float(np.max(invested)), 4),
        "avg_cash_share": round(float(np.mean(cash_share)), 4),
    }


def portfolio_risk_report(equity_curve: list[dict[str, Any]], alphas: tuple[float, ...] = (0.95, 0.99)) -> dict[str, Any]:
    rets = equity_returns([float(r["equity"]) for r in equity_curve])
    return {
        "margin": margin_usage(equity_curve),
        "tails": {str(a): historical_var_es(rets, a) for a in alphas},
        "vol_daily": None if rets.size < 2 else round(float(np.std(rets, ddof=1)), 6),
        "vol_annual": None if rets.size < 2 else round(float(np.std(rets, ddof=1) * np.sqrt(252)), 6),
    }
