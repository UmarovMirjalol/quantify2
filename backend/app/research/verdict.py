"""One verdict across every check the platform runs on a backtest.

Each check maps its own verdict to pass, warn, fail, or skip (not enough data to
say). The grade is driven by the share of passed checks, but a single hard fail on
the out-of-sample tests caps it, because a curve that breaks on unseen data is not
rescued by looking good elsewhere.
"""

from __future__ import annotations

from typing import Any

PASS, WARN, FAIL, SKIP = "pass", "warn", "fail", "skip"
OUT_OF_SAMPLE = {"holdout", "walk_forward"}

_MAPS: dict[str, dict[str, str]] = {
    "holdout": {"holds": PASS, "fragile": WARN, "overfit": FAIL},
    "walk_forward": {"stable": PASS, "uneven": WARN, "fails": FAIL},
    "deflated_sharpe": {"survives": PASS, "weak": WARN, "luck": FAIL},
    "costs": {"room": PASS, "thin": WARN, "gone": FAIL, "no_edge": FAIL},
    "heatmap": {"plateau": PASS, "peak": WARN, "no_edge": FAIL},
    "regimes": {"both": PASS, "uptrend": WARN, "downtrend": WARN, "neither": FAIL},
    "market": {"alpha": PASS, "unproven": WARN, "beta": FAIL, "no_edge": FAIL},
}

_LABELS = {
    "holdout": "Holdout (last 30%)",
    "walk_forward": "Walk-forward refit",
    "deflated_sharpe": "Deflated Sharpe",
    "costs": "Cost break-even",
    "heatmap": "Parameter heatmap",
    "regimes": "Market regimes",
    "market": "Alpha vs buy & hold",
    "monte_carlo": "Monte Carlo (trade order)",
}


def _check(key: str, report: dict[str, Any] | None) -> dict[str, Any]:
    if not report:
        return {"key": key, "label": _LABELS[key], "status": SKIP, "detail": "Not run."}
    if key == "heatmap" and not report.get("available", True):
        return {"key": key, "label": _LABELS[key], "status": SKIP, "detail": report.get("headline", "")}
    status = _MAPS[key].get(str(report.get("verdict")), SKIP)
    return {"key": key, "label": _LABELS[key], "status": status, "detail": report.get("headline", "")}


def _monte_carlo_check(mc: dict[str, Any] | None) -> dict[str, Any]:
    base = {"key": "monte_carlo", "label": _LABELS["monte_carlo"]}
    if not mc or not mc.get("num_simulations"):
        return {**base, "status": SKIP, "detail": "Needs at least three trades to reshuffle."}
    lower = float(mc.get("confidence_95_lower") or 0.0)
    median = float(mc.get("median_return") or 0.0)
    ruin = float(mc.get("risk_of_ruin") or 0.0)
    if ruin > 0.05:
        return {**base, "status": FAIL, "detail": f"{ruin * 100:.0f}% of reshuffled paths hit ruin."}
    if lower > 0:
        return {**base, "status": PASS, "detail": f"Even the 5th-percentile ordering ends up {lower * 100:+.1f}%."}
    if median > 0:
        return {**base, "status": WARN, "detail": f"Median ordering earns {median * 100:+.1f}%, but the bad 5% lose money."}
    return {**base, "status": FAIL, "detail": f"The median reshuffled path returns {median * 100:+.1f}%."}


def build_verdict(
    results: dict[str, Any],
    stress: dict[str, Any] | None = None,
    walk: dict[str, Any] | None = None,
    robust: dict[str, Any] | None = None,
) -> dict[str, Any]:
    robust = robust or {}
    checks = [
        _check("holdout", stress),
        _check("walk_forward", walk),
        _check("deflated_sharpe", robust.get("deflated")),
        _check("costs", robust.get("costs")),
        _check("heatmap", robust.get("heatmap")),
        _check("regimes", results.get("regimes")),
        _check("market", results.get("market")),
        _monte_carlo_check(results.get("monte_carlo")),
    ]
    scored = [c for c in checks if c["status"] != SKIP]
    points = {PASS: 1.0, WARN: 0.5, FAIL: 0.0}
    score = round(100 * sum(points[c["status"]] for c in scored) / len(scored)) if scored else 0
    passed = sum(c["status"] == PASS for c in scored)
    oos_fail = any(c["status"] == FAIL and c["key"] in OUT_OF_SAMPLE for c in scored)

    if len(scored) < 3:
        grade, headline = "insufficient", "Too few checks had enough data to judge this strategy."
    elif score >= 75 and not oos_fail:
        grade, headline = "robust", "The edge survives unseen data, costs, and luck adjustments."
    elif score >= 50 and not oos_fail:
        grade, headline = "promising", "Some evidence of an edge, with weak spots worth fixing before trusting it."
    elif oos_fail:
        grade, headline = "overfit", "The curve breaks on data the rules were not tuned on."
    else:
        grade, headline = "no_edge", "Most checks say the result is noise, market drift, or cost-fragile."

    return {
        "grade": grade,
        "score": score,
        "headline": headline,
        "passed": passed,
        "scored": len(scored),
        "checks": checks,
    }
