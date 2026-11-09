"""Robustness checks that a single equity curve cannot show on its own.

Deflated Sharpe follows Bailey & López de Prado (2014): the more variants a
person tries, the higher the best Sharpe will be by luck alone. Trial count and
Sharpe dispersion come from this browser's saved runs on the same dataset.
"""

from __future__ import annotations

import math
from statistics import NormalDist
from typing import Any

import numpy as np
import pandas as pd

from app.backtesting.engine import BacktestEngine, BacktestError
from app.llm.schemas import IndicatorRef, StrategySpec
from app.metrics.performance import TRADING_DAYS_PER_YEAR

EULER_GAMMA = 0.5772156649015329
COST_LEVELS = [0.0, 0.0005, 0.001, 0.002, 0.003, 0.005, 0.0075, 0.01, 0.015, 0.02]
FAST_GRID = [5, 10, 15, 20, 30, 40, 50]
SLOW_GRID = [20, 30, 50, 75, 100, 150, 200]
_NORMAL = NormalDist()


def deflated_sharpe(equity: list[float], trial_sharpes: list[float]) -> dict[str, Any]:
    values = np.asarray(equity, dtype=float)
    returns = np.diff(values) / values[:-1] if len(values) >= 2 else np.array([])
    returns = returns[np.isfinite(returns)]
    trials = max(1, len(trial_sharpes))
    if len(returns) < 30 or float(np.std(returns, ddof=1)) == 0.0:
        return {
            "verdict": "thin",
            "headline": "Too few daily returns to test whether this Sharpe beats luck.",
            "trials": trials,
            "sharpe": None,
            "expected_max_sharpe": None,
            "probability": None,
        }

    count = len(returns)
    sharpe = float(np.mean(returns) / np.std(returns, ddof=1))
    centered = returns - np.mean(returns)
    sd = float(np.std(returns))
    skew = float(np.mean(centered**3) / sd**3)
    kurt = float(np.mean(centered**4) / sd**4)

    per_period = [s / math.sqrt(TRADING_DAYS_PER_YEAR) for s in trial_sharpes if s is not None]
    variance = float(np.var(per_period, ddof=1)) if len(per_period) >= 2 else 0.0
    variance = max(variance, 1.0 / count)
    if trials <= 1:
        benchmark = 0.0
    else:
        benchmark = math.sqrt(variance) * (
            (1.0 - EULER_GAMMA) * _NORMAL.inv_cdf(1.0 - 1.0 / trials)
            + EULER_GAMMA * _NORMAL.inv_cdf(1.0 - 1.0 / (trials * math.e))
        )
    spread = 1.0 - skew * sharpe + (kurt - 1.0) / 4.0 * sharpe**2
    z = (sharpe - benchmark) * math.sqrt(count - 1) / math.sqrt(max(spread, 1e-9))
    probability = _NORMAL.cdf(z)

    annual = math.sqrt(TRADING_DAYS_PER_YEAR)
    if probability >= 0.95:
        verdict = "survives"
        headline = (
            f"After counting {trials} tries on this dataset, the Sharpe still clears what luck alone would produce."
        )
    elif probability >= 0.5:
        verdict = "weak"
        headline = (
            f"With {trials} tries on this dataset, this Sharpe is only modestly above the best a random variant would show."
        )
    else:
        verdict = "luck"
        headline = (
            f"{trials} tries on this dataset are enough to produce a Sharpe like this by chance."
        )
    return {
        "verdict": verdict,
        "headline": headline,
        "trials": trials,
        "sharpe": sharpe * annual,
        "expected_max_sharpe": benchmark * annual,
        "probability": probability,
    }


def cost_breakeven(strategy: StrategySpec, data: pd.DataFrame) -> dict[str, Any]:
    current = float(strategy.commission) + float(strategy.slippage)
    points: list[dict[str, Any]] = []
    for level in COST_LEVELS:
        spec = strategy.model_copy(update={"commission": level / 2.0, "slippage": level / 2.0})
        result = _run(spec, data)
        if result is None:
            continue
        points.append({"cost": level, "total_return": result.get("total_return")})

    breakeven = _first_crossing(points)
    base = points[0]["total_return"] if points else None
    if base is None or base <= 0:
        verdict = "no_edge"
        headline = "The rules lose money even with zero costs, so there is no edge for costs to remove."
    elif breakeven is None:
        verdict = "room"
        headline = "The edge survives every tested cost level, up to 2% per side."
    elif breakeven <= current:
        verdict = "gone"
        headline = (
            f"The edge vanishes at {breakeven * 100:.2f}% per side, at or below the costs you entered."
        )
    elif breakeven < max(3 * current, 0.001):
        verdict = "thin"
        headline = (
            f"The edge vanishes at {breakeven * 100:.2f}% per side. That is little headroom over real-world costs."
        )
    else:
        verdict = "room"
        headline = (
            f"The edge holds until about {breakeven * 100:.2f}% per side, well above the costs you entered."
        )
    return {
        "verdict": verdict,
        "headline": headline,
        "current_cost": current,
        "breakeven": breakeven,
        "points": points,
    }


def parameter_heatmap(strategy: StrategySpec, data: pd.DataFrame) -> dict[str, Any]:
    pair = _crossover(strategy)
    if pair is None:
        return {
            "available": False,
            "headline": "The heatmap needs a crossover between two periods of the same indicator, like SMA 20 × SMA 50.",
        }
    name, fast_side, fast, slow = pair
    fast_grid = sorted(set(FAST_GRID + [fast]))
    slow_grid = sorted(set(SLOW_GRID + [slow]))
    slow_side = "right" if fast_side == "left" else "left"

    cells: list[dict[str, Any]] = []
    for f in fast_grid:
        for s in slow_grid:
            if f >= s:
                continue
            spec = _with_periods(strategy, fast_side, f, slow_side, s)
            result = _run(spec, data)
            cells.append(
                {
                    "fast": f,
                    "slow": s,
                    "sharpe": None if result is None else result.get("sharpe_ratio"),
                    "total_return": None if result is None else result.get("total_return"),
                    "chosen": f == fast and s == slow,
                }
            )

    verdict, headline, share = _plateau(cells, fast_grid, slow_grid, fast, slow)
    return {
        "available": True,
        "indicator": name,
        "fast_values": fast_grid,
        "slow_values": slow_grid,
        "chosen": {"fast": fast, "slow": slow},
        "cells": cells,
        "verdict": verdict,
        "headline": headline,
        "neighbor_share": share,
    }


def _run(spec: StrategySpec, data: pd.DataFrame) -> dict[str, Any] | None:
    try:
        return BacktestEngine(spec).run(data.reset_index(drop=True))["metrics"]
    except (BacktestError, ValueError):
        return None


def _first_crossing(points: list[dict[str, Any]]) -> float | None:
    for prev, cur in zip(points, points[1:]):
        a, b = prev["total_return"], cur["total_return"]
        if a is None or b is None:
            continue
        if a > 0 >= b:
            if a == b:
                return float(cur["cost"])
            return float(prev["cost"] + (cur["cost"] - prev["cost"]) * a / (a - b))
    return None


def _crossover(strategy: StrategySpec) -> tuple[str, str, int, int] | None:
    if not strategy.entry_conditions:
        return None
    cond = strategy.entry_conditions[0]
    left, right = cond.left, cond.right
    if not isinstance(right, IndicatorRef) or left.indicator != right.indicator:
        return None
    if not left.period or not right.period or left.period == right.period:
        return None
    if left.period < right.period:
        return left.indicator.value, "left", int(left.period), int(right.period)
    return left.indicator.value, "right", int(right.period), int(left.period)


def _with_periods(
    strategy: StrategySpec, fast_side: str, fast: int, slow_side: str, slow: int
) -> StrategySpec:
    old_fast, old_slow = _period_pair(strategy, fast_side, slow_side)

    def remap(cond: Any) -> Any:
        updates: dict[str, Any] = {}
        for side in ("left", "right"):
            ref = getattr(cond, side)
            if not isinstance(ref, IndicatorRef) or ref.period is None:
                continue
            if ref.period == old_fast:
                updates[side] = ref.model_copy(update={"period": fast})
            elif ref.period == old_slow:
                updates[side] = ref.model_copy(update={"period": slow})
        return cond.model_copy(update=updates) if updates else cond

    return strategy.model_copy(
        update={
            "entry_conditions": [remap(c) for c in strategy.entry_conditions],
            "exit_conditions": [remap(c) for c in strategy.exit_conditions],
        }
    )


def _period_pair(strategy: StrategySpec, fast_side: str, slow_side: str) -> tuple[int, int]:
    cond = strategy.entry_conditions[0]
    return int(getattr(cond, fast_side).period), int(getattr(cond, slow_side).period)


def _plateau(
    cells: list[dict[str, Any]],
    fast_grid: list[int],
    slow_grid: list[int],
    fast: int,
    slow: int,
) -> tuple[str, str, float | None]:
    lookup = {(c["fast"], c["slow"]): c["sharpe"] for c in cells}
    chosen = lookup.get((fast, slow))
    if chosen is None or chosen <= 0:
        return (
            "no_edge",
            "The chosen setting does not have a positive Sharpe, so there is no plateau to protect.",
            None,
        )
    fi, si = fast_grid.index(fast), slow_grid.index(slow)
    neighbors = []
    for df_ in (-1, 0, 1):
        for ds in (-1, 0, 1):
            if df_ == 0 and ds == 0:
                continue
            a, b = fi + df_, si + ds
            if 0 <= a < len(fast_grid) and 0 <= b < len(slow_grid):
                value = lookup.get((fast_grid[a], slow_grid[b]))
                if value is not None:
                    neighbors.append(value)
    if not neighbors:
        return ("peak", "No neighboring settings could be tested around this choice.", 0.0)
    share = sum(1 for v in neighbors if v >= 0.5 * chosen) / len(neighbors)
    if share >= 0.6:
        return (
            "plateau",
            "Nearby settings keep most of the Sharpe. The choice sits on a plateau, not a lucky spike.",
            share,
        )
    return (
        "peak",
        "Most nearby settings lose more than half the Sharpe. The choice sits on an isolated peak.",
        share,
    )
