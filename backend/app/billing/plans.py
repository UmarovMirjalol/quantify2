"""Product plans for Hosted Free/Pro and self-host license unlock."""

from __future__ import annotations

from typing import Any, Literal

PlanId = Literal["free", "pro", "self_host"]

PLANS: dict[str, dict[str, Any]] = {
    "free": {
        "id": "free",
        "name": "Free",
        "price_usd_month": 0,
        "blurb": "Research desk for individuals — capped volume.",
        "features": [
            "Workspace, guru check, what-if, leaderboard",
            "Results history in this account",
            "3 forward tests",
            "20 backtests / day",
            "Verdict & promote gate",
        ],
        "limits": {
            "backtests_per_day": 20,
            "forward_tests": 3,
            "farm_jobs": False,
            "matrix_refresh": False,
            "paper_webhook": False,
            "book_desk": False,
            "ops_ritual": True,
            "llm_parser": False,
            "export_pack": False,
        },
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "price_usd_month": 29,
        "blurb": "Hosted research terminal — farm, matrix, ops, book.",
        "features": [
            "Everything in Free",
            "Research farm + playbook matrix refresh",
            "25 forward tests",
            "200 backtests / day",
            "Paper webhook + morning ritual fleet",
            "Research book + investor export packs",
            "LLM parser (bring your key or ours when enabled)",
        ],
        "limits": {
            "backtests_per_day": 200,
            "forward_tests": 25,
            "farm_jobs": True,
            "matrix_refresh": True,
            "paper_webhook": True,
            "book_desk": True,
            "ops_ritual": True,
            "llm_parser": True,
            "export_pack": True,
        },
    },
    "self_host": {
        "id": "self_host",
        "name": "Self-host license",
        "price_usd_year": 499,
        "blurb": "Run Quantify on your infra with Pro entitlements + commercial use.",
        "features": [
            "Docker / Compose deploy on your servers",
            "Pro entitlements for every seat on the instance",
            "Commercial use of the hosted binary stack you operate",
            "Priority support channel (email)",
            "MIT source remains available; license covers support + Pro unlock key",
        ],
        "limits": {
            "backtests_per_day": 10_000,
            "forward_tests": 100,
            "farm_jobs": True,
            "matrix_refresh": True,
            "paper_webhook": True,
            "book_desk": True,
            "ops_ritual": True,
            "llm_parser": True,
            "export_pack": True,
        },
    },
}


def plan_catalog() -> list[dict[str, Any]]:
    return [PLANS["free"], PLANS["pro"], PLANS["self_host"]]


def limits_for(plan: str) -> dict[str, Any]:
    key = plan if plan in PLANS else "free"
    return dict(PLANS[key]["limits"])


def normalize_plan(plan: str | None) -> PlanId:
    if plan in ("pro", "self_host", "free"):
        return plan  # type: ignore[return-value]
    return "free"
