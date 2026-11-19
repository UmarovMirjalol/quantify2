"""Resolve effective plan + enforce feature/quota gates."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import Header, HTTPException
from sqlalchemy.orm import Session

from app.api.accounts import account_for_session
from app.billing.instance import get_instance_plan_override
from app.billing.plans import limits_for, normalize_plan
from app.config import get_settings
from app.models.account import Account
from app.models.usage import UsageDay


def effective_plan(account: Account | None) -> str:
    settings = get_settings()
    override = get_instance_plan_override()
    if override in {"pro", "self_host"}:
        return override
    if settings.instance_plan in {"pro", "self_host"}:
        return settings.instance_plan
    if account is None:
        return "free"
    plan = normalize_plan(getattr(account, "plan", None))
    status = getattr(account, "plan_status", None) or "none"
    if status == "active" and plan in {"pro", "self_host"}:
        return plan
    if status == "past_due" and plan == "pro":
        return "pro"
    return "free"


def entitlements_payload(account: Account | None) -> dict[str, Any]:
    plan = effective_plan(account)
    limits = limits_for(plan)
    return {
        "plan": plan,
        "limits": limits,
        "signed_in": account is not None,
        "username": account.username if account else None,
        "plan_status": account.plan_status if account else "none",
        "stripe_customer_id": account.stripe_customer_id if account else None,
        "billing_enabled": bool(get_settings().stripe_secret_key),
        "instance_plan": get_settings().instance_plan or None,
    }


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def count_backtest_today(db: Session, client_id: str) -> int:
    row = db.get(UsageDay, {"client_id": client_id, "day": _today()})
    return int(row.backtests) if row else 0


def bump_backtest(db: Session, client_id: str) -> int:
    day = _today()
    row = db.get(UsageDay, {"client_id": client_id, "day": day})
    if row is None:
        row = UsageDay(client_id=client_id, day=day, backtests=1)
        db.add(row)
    else:
        row.backtests = int(row.backtests or 0) + 1
    db.commit()
    return int(row.backtests)


def require_feature(
    feature: str,
    *,
    x_session: str | None,
    db: Session,
) -> Account | None:
    """Raise 402 if the caller's plan lacks ``feature`` (boolean limit)."""
    account = account_for_session(db, x_session)
    plan = effective_plan(account)
    limits = limits_for(plan)
    allowed = limits.get(feature)
    if allowed is True:
        return account
    if allowed is False or allowed is None:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "upgrade_required",
                "feature": feature,
                "plan": plan,
                "message": f"“{feature}” needs Pro or a self-host license. Upgrade at /pricing.",
            },
        )
    return account


def enforce_backtest_quota(db: Session, client_id: str, account: Account | None) -> None:
    plan = effective_plan(account)
    cap = int(limits_for(plan).get("backtests_per_day") or 20)
    used = count_backtest_today(db, client_id)
    if used >= cap:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "daily_backtest_cap",
                "plan": plan,
                "used": used,
                "cap": cap,
                "message": f"Daily backtest cap ({cap}) reached for plan “{plan}”. Upgrade at /pricing.",
            },
        )


def forward_cap(account: Account | None) -> int:
    return int(limits_for(effective_plan(account)).get("forward_tests") or 3)
