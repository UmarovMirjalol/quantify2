"""Walk-forward: refit one entry parameter on past bars, score only the next slice.

The series is cut into five equal parts. Fold k trains on everything before
part k and is judged only on part k. The chosen parameter is the train-window
Sharpe leader. Bars inside the test slice never vote.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from app.backtesting.engine import BacktestError
from app.llm.schemas import StrategySpec
from app.research.stress import (
    _apply,
    _fast_values,
    _knob,
    _period_values,
    _summarize,
    _threshold_values,
)

MIN_BARS = 120
PARTS = 5


def run_walk_forward(strategy: StrategySpec, data: pd.DataFrame) -> dict[str, Any]:
    n = len(data)
    if n < MIN_BARS:
        raise ValueError(f"Need at least {MIN_BARS} bars for a walk-forward.")
    size = n // PARTS
    if size < 20:
        raise ValueError("Each walk-forward slice needs at least 20 bars.")

    knob = _knob(strategy)
    folds: list[dict[str, Any]] = []
    for k in range(1, PARTS):
        train = data.iloc[: k * size]
        end = n if k == PARTS - 1 else (k + 1) * size
        test = data.iloc[k * size : end]
        chosen, label, value = _pick(strategy, train, knob)
        try:
            tested = _summarize(chosen, test, with_equity=False)
        except (BacktestError, ValueError):
            tested = {
                "total_return": None,
                "sharpe_ratio": None,
                "number_of_trades": 0,
                "start_date": "",
                "end_date": "",
            }
        folds.append(
            {
                "fold": k,
                "parameter": label,
                "value": value,
                "test_return": tested["total_return"],
                "test_sharpe": tested["sharpe_ratio"],
                "test_trades": tested["number_of_trades"],
                "start_date": tested["start_date"],
                "end_date": tested["end_date"],
            }
        )

    verdict, headline = _verdict(folds)
    usable = [fold for fold in folds if fold["test_trades"] >= 2 and fold["test_sharpe"] is not None]
    hits = sum(1 for fold in usable if float(fold["test_sharpe"]) > 0)
    return {
        "verdict": verdict,
        "headline": headline,
        "parameter": None if knob is None else knob[4],
        "refit": knob is not None,
        "hit_rate": (hits / len(usable)) if usable else None,
        "folds": folds,
    }


def _pick(
    strategy: StrategySpec,
    train: pd.DataFrame,
    knob: tuple[str, str | None, float, float | None, str] | None,
) -> tuple[StrategySpec, str | None, float | None]:
    if knob is None:
        return strategy, None, None
    kind, side, base, slow, name = knob
    if kind == "period" and slow is not None:
        values = _fast_values(int(base), int(slow))
    elif kind == "threshold":
        values = _threshold_values(float(base))
    else:
        values = _period_values(int(base))
    nearest = sorted(values, key=lambda item: (abs(float(item) - float(base)), float(item)))[:3]
    best_spec = strategy
    best_value = float(base)
    best_sharpe = float("-inf")
    for value in nearest:
        variant = _apply(strategy, kind, side, float(value))
        try:
            summary = _summarize(variant, train, with_equity=False)
        except (BacktestError, ValueError):
            continue
        sharpe = summary["sharpe_ratio"]
        score = float("-inf") if sharpe is None else float(sharpe)
        if score > best_sharpe:
            best_sharpe = score
            best_spec = variant
            best_value = float(value)
    shown = int(best_value) if float(best_value).is_integer() else best_value
    return best_spec, f"{name} {shown}", best_value


def _verdict(folds: list[dict[str, Any]]) -> tuple[str, str]:
    usable = [fold for fold in folds if fold["test_trades"] >= 2 and fold["test_sharpe"] is not None]
    if len(usable) < 2:
        return (
            "thin",
            "Most test slices have fewer than two trades. There is not enough walk-forward evidence yet.",
        )
    hits = sum(1 for fold in usable if float(fold["test_sharpe"]) > 0)
    rate = hits / len(usable)
    if rate >= 0.75:
        return (
            "stable",
            "The parameter was re-chosen on past bars only, and the next slice still made money in most windows.",
        )
    if rate >= 0.5:
        return (
            "uneven",
            "Some unseen slices keep the edge and some give it back. The result depends on which years you keep.",
        )
    return (
        "fails",
        "After refitting on the past, the next slice usually does not pay. The in-sample Sharpe does not travel.",
    )
