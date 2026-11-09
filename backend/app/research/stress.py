"""Holdout audit: same rules on unseen bars, plus a nearby-parameter check.

The fit window is the first 70% of bars. The holdout is the last 30%, never
used to pick the rules. Neighbors rerun the full sample with the main entry
parameter nudged, so a lonely Sharpe spike is visible.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from app.backtesting.engine import BacktestEngine, BacktestError
from app.llm.schemas import IndicatorRef, StrategySpec

MIN_BARS = 80
HOLDOUT_FRACTION = 0.30


def run_stress(strategy: StrategySpec, data: pd.DataFrame) -> dict[str, Any]:
    n = len(data)
    if n < MIN_BARS:
        raise ValueError(f"Need at least {MIN_BARS} bars for a holdout audit.")
    cut = int(n * (1.0 - HOLDOUT_FRACTION))
    if cut < 40 or n - cut < 24:
        raise ValueError("Not enough bars on both sides of the holdout split.")

    ins = _summarize(strategy, data.iloc[:cut], with_equity=True)
    oos = _summarize(strategy, data.iloc[cut:], with_equity=True)
    knob, neighbors = _neighbors(strategy, data)
    verdict, headline = _verdict(ins, oos, neighbors)
    return {
        "verdict": verdict,
        "headline": headline,
        "split": {
            "in_sample_bars": cut,
            "holdout_bars": n - cut,
            "holdout_fraction": HOLDOUT_FRACTION,
        },
        "in_sample": ins,
        "holdout": oos,
        "parameter": knob,
        "neighbors": neighbors,
    }


def _summarize(strategy: StrategySpec, frame: pd.DataFrame, *, with_equity: bool) -> dict[str, Any]:
    result = BacktestEngine(strategy).run(frame.reset_index(drop=True))
    metrics = result["metrics"]
    out: dict[str, Any] = {
        "total_return": metrics.get("total_return"),
        "sharpe_ratio": metrics.get("sharpe_ratio"),
        "max_drawdown": metrics.get("max_drawdown"),
        "number_of_trades": int(metrics.get("number_of_trades") or 0),
        "start_date": str(metrics.get("start_date") or "")[:10],
        "end_date": str(metrics.get("end_date") or "")[:10],
    }
    if with_equity:
        curve = result["equity_curve"]
        step = max(1, len(curve) // 48)
        out["equity"] = [
            {"date": str(point["date"])[:10], "equity": point["equity"]}
            for point in curve[::step]
        ]
    return out


def _neighbors(
    strategy: StrategySpec, data: pd.DataFrame
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    plan = _knob(strategy)
    if plan is None:
        return None, []
    kind, side, base, slow, name = plan
    if kind == "period" and slow is not None:
        values = _fast_values(int(base), int(slow))
        label = f"{name} fast period"
    elif kind == "threshold":
        values = _threshold_values(float(base))
        label = f"{name} threshold"
    else:
        values = _period_values(int(base))
        label = f"{name} period"

    rows: list[dict[str, Any]] = []
    for value in values:
        variant = _apply(strategy, kind, side, value)
        try:
            summary = _summarize(variant, data, with_equity=False)
        except (BacktestError, ValueError):
            continue
        rows.append(
            {
                "label": _value_label(name, kind, value),
                "value": value,
                "chosen": _same(value, base),
                "sharpe_ratio": summary["sharpe_ratio"],
                "total_return": summary["total_return"],
                "number_of_trades": summary["number_of_trades"],
            }
        )
    return {"label": label, "value": base}, rows


def _knob(strategy: StrategySpec) -> tuple[str, str | None, float, float | None, str] | None:
    if not strategy.entry_conditions:
        return None
    cond = strategy.entry_conditions[0]
    left, right = cond.left, cond.right
    if (
        isinstance(right, IndicatorRef)
        and left.period
        and right.period
        and left.indicator == right.indicator
    ):
        if left.period <= right.period:
            return ("period", "left", float(left.period), float(right.period), left.indicator.value)
        return ("period", "right", float(right.period), float(left.period), right.indicator.value)
    if isinstance(right, (int, float)) and not isinstance(right, bool):
        return ("threshold", None, float(right), None, left.indicator.value)
    if left.period:
        return ("period", "left", float(left.period), None, left.indicator.value)
    return None


def _apply(strategy: StrategySpec, kind: str, side: str | None, value: float) -> StrategySpec:
    spec = strategy.model_copy(deep=True)
    conds = list(spec.entry_conditions)
    cond = conds[0]
    if kind == "threshold":
        conds[0] = cond.model_copy(update={"right": float(value)})
    else:
        ref = getattr(cond, side or "left")
        conds[0] = cond.model_copy(update={side or "left": ref.model_copy(update={"period": int(value)})})
    return spec.model_copy(update={"entry_conditions": conds})


def _fast_values(fast: int, slow: int) -> list[int]:
    values: list[int] = []
    for delta in (-10, -5, 0, 5, 10):
        period = fast + delta
        if 2 <= period < slow and period not in values:
            values.append(period)
    if fast not in values:
        values.append(fast)
    return sorted(values)


def _period_values(base: int) -> list[int]:
    values: list[int] = []
    for scale in (0.6, 0.8, 1.0, 1.2, 1.4):
        period = max(2, min(200, round(base * scale)))
        if period not in values:
            values.append(period)
    return values


def _threshold_values(base: float) -> list[float]:
    values: list[float] = []
    for delta in (-10, -5, 0, 5, 10):
        value = round(base + delta, 2)
        if 1 <= value <= 99 and value not in values:
            values.append(value)
    if round(base, 2) not in values:
        values.append(round(base, 2))
    return values


def _value_label(name: str, kind: str, value: float) -> str:
    if kind == "threshold":
        shown = int(value) if float(value).is_integer() else value
        return f"{name} {shown}"
    return f"{name} {int(value)}"


def _same(value: float, base: float) -> bool:
    return abs(float(value) - float(base)) < 1e-6


def _verdict(
    ins: dict[str, Any], oos: dict[str, Any], neighbors: list[dict[str, Any]]
) -> tuple[str, str]:
    is_sharpe = 0.0 if ins["sharpe_ratio"] is None else float(ins["sharpe_ratio"])
    oos_sharpe = 0.0 if oos["sharpe_ratio"] is None else float(oos["sharpe_ratio"])
    if oos["number_of_trades"] < 3:
        return (
            "thin",
            "The holdout window produced fewer than three trades. The equity curve is not evidence yet.",
        )

    chosen = next((row for row in neighbors if row["chosen"]), None)
    others = [
        float(row["sharpe_ratio"])
        for row in neighbors
        if not row["chosen"] and row["sharpe_ratio"] is not None
    ]
    spike = False
    if chosen and chosen["sharpe_ratio"] is not None and others:
        chosen_sharpe = float(chosen["sharpe_ratio"])
        if chosen_sharpe >= 0.4 and chosen_sharpe - max(others) >= 0.35:
            spike = True

    if is_sharpe >= 0.4 and oos_sharpe < 0:
        return (
            "overfit",
            "The fit window earns a positive Sharpe and the unseen tail does not. That is a curve tuned to history.",
        )
    if spike or (is_sharpe > 0.2 and oos_sharpe < is_sharpe * 0.35):
        return (
            "fragile",
            "A small change — the next slice of data, or a nearby parameter — takes most of the Sharpe away.",
        )
    if oos_sharpe > 0 and oos_sharpe + 1e-9 >= min(is_sharpe, 0.15):
        return (
            "holds",
            "The same rules still make money on bars the fit window never saw, and nearby parameters do not collapse.",
        )
    return (
        "fragile",
        "The holdout does not confirm the fit window. Treat the headline return as a hypothesis.",
    )
