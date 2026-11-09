"""Alpha and beta against buy-and-hold of the same asset.

Regresses per-bar strategy returns on per-bar market returns. Beta is how much of the
market move the strategy carries; alpha is the annualized return left over once that
exposure is paid for. A strategy that only made money because the asset went up shows
a high R² and an alpha near zero.
"""

from __future__ import annotations

import math
from typing import Any, Sequence

import numpy as np

from app.metrics.performance import TRADING_DAYS_PER_YEAR

MIN_BARS = 30
SIGNIFICANT_T = 2.0
NEGLIGIBLE_ALPHA = 0.01


def _round(value: float, digits: int = 4) -> float:
    return round(float(value), digits) if math.isfinite(value) else 0.0


def _headline(verdict: str, alpha_annual: float, beta: float) -> str:
    alpha = alpha_annual * 100
    if verdict == "thin":
        return "Too few bars to separate skill from market exposure."
    if verdict == "alpha":
        return f"{alpha:+.1f}% a year beyond what a {beta:.2f} beta to the asset explains, and it is statistically clear."
    if verdict == "beta":
        return f"Most of the return is market exposure (beta {beta:.2f}); alpha is {alpha:+.1f}% a year."
    if verdict == "unproven":
        return f"Alpha of {alpha:+.1f}% a year, but too noisy to tell apart from zero."
    return f"No return left after market exposure (alpha {alpha:+.1f}% a year, beta {beta:.2f})."


def market_exposure(
    equity: Sequence[float],
    closes: Sequence[float],
    bars_per_year: int = TRADING_DAYS_PER_YEAR,
) -> dict[str, Any]:
    eq = np.asarray(equity, dtype=float)
    px = np.asarray(closes, dtype=float)
    n = min(len(eq), len(px))
    eq, px = eq[:n], px[:n]

    market_total = float(px[-1] / px[0] - 1.0) if n >= 2 and px[0] > 0 else 0.0
    strategy_total = float(eq[-1] / eq[0] - 1.0) if n >= 2 and eq[0] > 0 else 0.0
    base = {
        "bars": max(n - 1, 0),
        "market_return": _round(market_total),
        "strategy_return": _round(strategy_total),
        "excess_return": _round(strategy_total - market_total),
    }
    thin = {**base, "verdict": "thin", "headline": _headline("thin", 0.0, 0.0), "beta": 0.0,
            "alpha_annual": 0.0, "alpha_t": 0.0, "correlation": 0.0, "r_squared": 0.0,
            "up_capture": 0.0, "down_capture": 0.0}
    if n - 1 < MIN_BARS or np.any(eq[:-1] <= 0) or np.any(px[:-1] <= 0):
        return thin

    rs = eq[1:] / eq[:-1] - 1.0
    rm = px[1:] / px[:-1] - 1.0
    m_mean, s_mean = rm.mean(), rs.mean()
    sxx = float(((rm - m_mean) ** 2).sum())
    if sxx <= 0:
        return thin

    beta = float(((rm - m_mean) * (rs - s_mean)).sum() / sxx)
    alpha = float(s_mean - beta * m_mean)
    resid = rs - (alpha + beta * rm)
    dof = len(rs) - 2
    s2 = float((resid ** 2).sum() / dof) if dof > 0 else 0.0
    se_alpha = math.sqrt(s2 * (1.0 / len(rs) + m_mean ** 2 / sxx)) if s2 > 0 else 0.0
    alpha_t = alpha / se_alpha if se_alpha > 0 else 0.0

    s_std = float(rs.std())
    corr = float(np.corrcoef(rs, rm)[0, 1]) if s_std > 0 else 0.0
    r2 = corr ** 2

    up, down = rm > 0, rm < 0
    up_capture = float(rs[up].mean() / rm[up].mean()) if up.any() else 0.0
    down_capture = float(rs[down].mean() / rm[down].mean()) if down.any() else 0.0

    alpha_annual = alpha * bars_per_year
    if alpha_t >= SIGNIFICANT_T:
        verdict = "alpha"
    elif r2 >= 0.3 and abs(alpha_annual) <= NEGLIGIBLE_ALPHA:
        verdict = "beta"
    elif alpha_annual > NEGLIGIBLE_ALPHA:
        verdict = "unproven"
    else:
        verdict = "no_edge"

    return {
        **base,
        "verdict": verdict,
        "headline": _headline(verdict, alpha_annual, beta),
        "beta": _round(beta),
        "alpha_annual": _round(alpha_annual),
        "alpha_t": _round(alpha_t, 2),
        "correlation": _round(corr),
        "r_squared": _round(r2),
        "up_capture": _round(up_capture),
        "down_capture": _round(down_capture),
    }
