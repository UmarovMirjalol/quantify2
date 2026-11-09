"""Parameter search that cannot peek at the data it is judged on.

Every candidate is scored only on the first 70% of bars. The winner is picked
there, then run once on the last 30%, which no candidate ever saw. The train
Sharpe of the winner is also deflated for the number of candidates tried, since
the best of many tries is inflated by luck alone.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from app.backtesting.engine import BacktestEngine, BacktestError
from app.llm.schemas import IndicatorRef, StrategySpec
from app.research.robustness import FAST_GRID, SLOW_GRID, deflated_sharpe

TRAIN_FRACTION = 0.70
MIN_BARS = 120
MIN_TRADES = 3
PERIOD_GRID = [5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200]
OSC_PERIODS = [7, 10, 14, 21, 28]
THRESHOLD_STEPS = [-20, -15, -10, -5, 0, 5, 10, 15, 20]


def _remap_periods(strategy: StrategySpec, indicator: str, mapping: dict[int, int]) -> StrategySpec:
    def remap(cond: Any) -> Any:
        updates: dict[str, Any] = {}
        for side in ("left", "right"):
            ref = getattr(cond, side)
            if (
                isinstance(ref, IndicatorRef)
                and ref.indicator.value == indicator
                and ref.period is not None
                and int(ref.period) in mapping
            ):
                updates[side] = ref.model_copy(update={"period": mapping[int(ref.period)]})
        return cond.model_copy(update=updates) if updates else cond

    return strategy.model_copy(
        update={
            "entry_conditions": [remap(c) for c in strategy.entry_conditions],
            "exit_conditions": [remap(c) for c in strategy.exit_conditions],
        }
    )


def _with_threshold(strategy: StrategySpec, value: float) -> StrategySpec:
    conds = list(strategy.entry_conditions)
    conds[0] = conds[0].model_copy(update={"right": float(value)})
    return strategy.model_copy(update={"entry_conditions": conds})


def search_space(strategy: StrategySpec) -> tuple[list[str], list[dict[str, Any]]]:
    """Return parameter names and candidates as {label, params, spec, original}."""
    if strategy.is_custom:
        raise ValueError("The optimizer tunes visual rules. A Python strategy owns its parameters in code.")
    if not strategy.entry_conditions:
        raise ValueError("The strategy has no entry rule to tune.")
    cond = strategy.entry_conditions[0]
    left, right = cond.left, cond.right
    name = left.indicator.value

    if (
        isinstance(right, IndicatorRef)
        and left.indicator == right.indicator
        and left.period
        and right.period
        and left.period != right.period
    ):
        fast, slow = sorted((int(left.period), int(right.period)))
        out = []
        for f in sorted(set(FAST_GRID + [fast])):
            for s in sorted(set(SLOW_GRID + [slow])):
                if f >= s:
                    continue
                spec = _remap_periods(strategy, name, {fast: f, slow: s}) if (f, s) != (fast, slow) else strategy
                out.append(
                    {
                        "label": f"{name} {f} × {s}",
                        "params": {"fast": f, "slow": s},
                        "spec": spec,
                        "original": (f, s) == (fast, slow),
                    }
                )
        return [f"{name} fast", f"{name} slow"], out

    if isinstance(right, (int, float)) and not isinstance(right, bool):
        base = float(right)
        thresholds = sorted({round(base + d, 2) for d in THRESHOLD_STEPS if 1 <= base + d <= 99} | {round(base, 2)})
        base_period = int(left.period) if left.period else None
        periods = sorted(set(OSC_PERIODS + [base_period])) if base_period else [None]
        out = []
        for p in periods:
            period_spec = strategy if p in (None, base_period) else _remap_periods(strategy, name, {base_period: p})
            for t in thresholds:
                spec = period_spec if t == round(base, 2) else _with_threshold(period_spec, t)
                shown = int(t) if float(t).is_integer() else t
                out.append(
                    {
                        "label": f"{name}({p}) {shown}" if p else f"{name} {shown}",
                        "params": {"period": p, "threshold": t} if p else {"threshold": t},
                        "spec": spec,
                        "original": p == base_period and t == round(base, 2),
                    }
                )
        names = [f"{name} period", f"{name} threshold"] if base_period else [f"{name} threshold"]
        return names, out

    if left.period:
        base = int(left.period)
        out = []
        for p in sorted(set(PERIOD_GRID + [base])):
            spec = strategy if p == base else _remap_periods(strategy, name, {base: p})
            out.append({"label": f"{name} {p}", "params": {"period": p}, "spec": spec, "original": p == base})
        return [f"{name} period"], out

    raise ValueError("The first entry rule has no period or threshold to tune.")


def _score(spec: StrategySpec, frame: pd.DataFrame) -> dict[str, Any] | None:
    try:
        result = BacktestEngine(spec).run(frame.reset_index(drop=True))
    except (BacktestError, ValueError):
        return None
    m = result["metrics"]
    return {
        "sharpe_ratio": m.get("sharpe_ratio"),
        "total_return": m.get("total_return"),
        "max_drawdown": m.get("max_drawdown"),
        "number_of_trades": int(m.get("number_of_trades") or 0),
        "equity": [float(pt["equity"]) for pt in result["equity_curve"]],
    }


def _public(score: dict[str, Any] | None) -> dict[str, Any] | None:
    if score is None:
        return None
    return {k: v for k, v in score.items() if k != "equity"}


def run_optimizer(strategy: StrategySpec, data: pd.DataFrame) -> dict[str, Any]:
    df = data.reset_index(drop=True)
    n = len(df)
    if n < MIN_BARS:
        raise ValueError(f"Need at least {MIN_BARS} bars to optimize without peeking.")
    names, candidates = search_space(strategy)
    cut = int(n * TRAIN_FRACTION)
    train, test = df.iloc[:cut], df.iloc[cut:]

    scored: list[dict[str, Any]] = []
    for cand in candidates:
        res = _score(cand["spec"], train)
        sharpe = None if res is None else res["sharpe_ratio"]
        eligible = res is not None and sharpe is not None and res["number_of_trades"] >= MIN_TRADES
        scored.append({**cand, "train": res, "eligible": eligible})

    ranked = sorted(
        (c for c in scored if c["eligible"]),
        key=lambda c: float(c["train"]["sharpe_ratio"]),
        reverse=True,
    )
    original = next((c for c in scored if c["original"]), None)
    split = {
        "train_bars": cut,
        "test_bars": n - cut,
        "train_end": str(df["date"].iloc[cut - 1])[:10],
        "test_start": str(df["date"].iloc[cut])[:10],
    }
    top = [
        {
            "label": c["label"],
            "params": c["params"],
            "train_sharpe": c["train"]["sharpe_ratio"],
            "train_return": c["train"]["total_return"],
            "trades": c["train"]["number_of_trades"],
            "original": c["original"],
        }
        for c in ranked[:10]
    ]
    base = {
        "parameters": names,
        "trials": len(candidates),
        "eligible": len(ranked),
        "split": split,
        "top": top,
    }
    if not ranked:
        return {
            **base,
            "verdict": "thin",
            "headline": f"None of the {len(candidates)} settings traded at least {MIN_TRADES} times in the training window.",
            "best": None,
            "original": None,
            "deflated": None,
            "best_strategy": None,
        }

    best = ranked[0]
    best_test = _score(best["spec"], test)
    orig_test = _score(original["spec"], test) if original else None
    deflated = deflated_sharpe(
        best["train"]["equity"],
        [float(c["train"]["sharpe_ratio"]) for c in ranked],
    )
    verdict, headline = _verdict(best, best_test, original, orig_test, len(candidates), deflated)

    return {
        **base,
        "verdict": verdict,
        "headline": headline,
        "best": {
            "label": best["label"],
            "params": best["params"],
            "train": _public(best["train"]),
            "test": _public(best_test),
            "is_original": best["original"],
        },
        "original": None
        if original is None
        else {
            "label": original["label"],
            "params": original["params"],
            "train": _public(original["train"]),
            "test": _public(orig_test),
        },
        "deflated": {
            "verdict": deflated["verdict"],
            "probability": deflated["probability"],
            "expected_max_sharpe": deflated["expected_max_sharpe"],
        },
        "best_strategy": best["spec"].model_dump(mode="json"),
    }


def _verdict(
    best: dict[str, Any],
    best_test: dict[str, Any] | None,
    original: dict[str, Any] | None,
    orig_test: dict[str, Any] | None,
    trials: int,
    deflated: dict[str, Any],
) -> tuple[str, str]:
    if best_test is None or best_test["number_of_trades"] < MIN_TRADES or best_test["sharpe_ratio"] is None:
        return "thin", "The winning setting trades too rarely in the unseen 30% to judge it."
    train_sharpe = float(best["train"]["sharpe_ratio"])
    test_sharpe = float(best_test["sharpe_ratio"])
    orig_sharpe = None
    if orig_test is not None and orig_test["sharpe_ratio"] is not None:
        orig_sharpe = float(orig_test["sharpe_ratio"])
    luck = deflated.get("verdict") == "luck"

    if train_sharpe > 0 and test_sharpe < 0:
        return (
            "overfit",
            f"The best of {trials} settings earned a {train_sharpe:.2f} Sharpe while it was being chosen and "
            f"{test_sharpe:.2f} on bars it never saw. The search found noise.",
        )
    if best["original"]:
        return (
            "already_best",
            f"Your setting already led all {trials} candidates in training, and it holds a {test_sharpe:.2f} Sharpe on unseen bars.",
        )
    if test_sharpe > 0 and (orig_sharpe is None or test_sharpe > orig_sharpe + 0.1) and not luck:
        return (
            "improves",
            f"{best['label']} beats your setting on bars no candidate saw ({test_sharpe:.2f} vs "
            f"{'—' if orig_sharpe is None else f'{orig_sharpe:.2f}'} Sharpe), and the win survives the {trials}-try luck adjustment.",
        )
    return (
        "no_gain",
        f"Tuning over {trials} settings does not beat your own choice on unseen bars"
        + (", and the training winner is within what luck would produce." if luck else "."),
    )
