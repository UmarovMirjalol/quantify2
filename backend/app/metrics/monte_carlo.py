"""Monte Carlo trade simulation engine."""

from __future__ import annotations

from typing import Any
import numpy as np


def run_monte_carlo_simulation(
    trades: list[Any],
    initial_capital: float = 100_000.0,
    num_simulations: int = 1000,
    ruin_drawdown_threshold: float = 0.4,
    seed: int | None = 42,
) -> dict[str, Any]:
    """Run Monte Carlo trade sequence resampling (bootstrap).

    Calculates Risk of Ruin, 95% worst drawdown, confidence intervals,
    and percentile fan curves.
    """
    if seed is not None:
        np.random.seed(seed)

    returns: list[float] = []
    for t in trades:
        ret = t.return_pct if hasattr(t, "return_pct") else t.get("return_pct", 0.0)
        if ret is not None and np.isfinite(ret):
            returns.append(float(ret))

    n_trades = len(returns)
    if n_trades < 3:
        return {
            "num_simulations": 0,
            "num_trades": n_trades,
            "risk_of_ruin": 0.0,
            "worst_drawdown_p95": 0.0,
            "median_return": 0.0,
            "median_final_equity": initial_capital,
            "confidence_95_lower": 0.0,
            "confidence_95_upper": 0.0,
            "fan_chart": {"p5": [], "p25": [], "p50": [], "p75": [], "p95": [], "steps": []},
            "error": "At least 3 trades are required for Monte Carlo simulation",
        }

    rets_arr = np.array(returns)
    resampled_indices = np.random.choice(n_trades, size=(num_simulations, n_trades), replace=True)
    sim_returns = rets_arr[resampled_indices]

    cum_growth = np.cumprod(1.0 + sim_returns, axis=1)
    all_equity = np.hstack([np.ones((num_simulations, 1)), cum_growth]) * initial_capital

    running_max = np.maximum.accumulate(all_equity, axis=1)
    drawdowns = (all_equity - running_max) / np.where(running_max == 0, 1.0, running_max)
    max_drawdowns = np.min(drawdowns, axis=1)

    ruined_count = np.sum(max_drawdowns <= -ruin_drawdown_threshold)
    risk_of_ruin = float(ruined_count / num_simulations)

    final_equities = all_equity[:, -1]
    final_returns = (final_equities - initial_capital) / initial_capital

    worst_dd_p95 = float(np.percentile(max_drawdowns, 5))
    median_return = float(np.median(final_returns))
    p5_return = float(np.percentile(final_returns, 5))
    p95_return = float(np.percentile(final_returns, 95))
    median_equity = float(np.median(final_equities))

    steps = n_trades + 1
    max_points = 50
    step_indices = (
        np.linspace(0, steps - 1, max_points, dtype=int) if steps > max_points else np.arange(steps)
    )

    percentiles_over_time = {
        "p5": np.percentile(all_equity[:, step_indices], 5, axis=0).round(2).tolist(),
        "p25": np.percentile(all_equity[:, step_indices], 25, axis=0).round(2).tolist(),
        "p50": np.percentile(all_equity[:, step_indices], 50, axis=0).round(2).tolist(),
        "p75": np.percentile(all_equity[:, step_indices], 75, axis=0).round(2).tolist(),
        "p95": np.percentile(all_equity[:, step_indices], 95, axis=0).round(2).tolist(),
        "steps": step_indices.tolist(),
    }

    return {
        "num_simulations": num_simulations,
        "num_trades": n_trades,
        "risk_of_ruin": round(risk_of_ruin, 4),
        "worst_drawdown_p95": round(worst_dd_p95, 4),
        "median_return": round(median_return, 4),
        "median_final_equity": round(median_equity, 2),
        "confidence_95_lower": round(p5_return, 4),
        "confidence_95_upper": round(p95_return, 4),
        "fan_chart": percentiles_over_time,
    }

