"""Hosted Pro (Stripe) + self-host license activation."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.accounts import account_for_session
from app.billing.entitlements import entitlements_payload
from app.billing.instance import set_instance_plan
from app.billing.license_keys import issue_license, verify_license
from app.billing.plans import plan_catalog
from app.billing.stripe_client import (
    create_checkout_session,
    create_portal_session,
    stripe_configured,
    verify_webhook_signature,
)
from app.config import get_settings
from app.database import get_db
from app.models.account import Account
from app.security import PUBLIC_PATHS

router = APIRouter(prefix="/api/billing")

# Keep catalog + webhook reachable behind deploy access token
PUBLIC_PATHS.update({"/api/billing/plans", "/api/billing/webhook"})


class CheckoutBody(BaseModel):
    success_url: str = Field(min_length=8, max_length=500)
    cancel_url: str = Field(min_length=8, max_length=500)
    email: str | None = Field(default=None, max_length=200)


class PortalBody(BaseModel):
    return_url: str = Field(min_length=8, max_length=500)


class LicenseBody(BaseModel):
    key: str = Field(min_length=3, max_length=500)


class IssueLicenseBody(BaseModel):
    licensee: str = Field(min_length=2, max_length=120)
    seats: int = Field(default=1, ge=1, le=500)
    exp: str | None = None
    admin_token: str = Field(min_length=8, max_length=200)


class DevUpgradeBody(BaseModel):
    plan: str = Field(default="pro", pattern=r"^(free|pro|self_host)$")


@router.get("/plans")
def plans() -> dict[str, Any]:
    settings = get_settings()
    return {
        "plans": plan_catalog(),
        "billing_enabled": stripe_configured(),
        "instance_plan": settings.instance_plan or None,
        "self_host_docs": "/pricing#self-host",
    }


@router.get("/me")
def billing_me(
    x_session: str | None = Header(default=None, alias="X-Session"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    account = account_for_session(db, x_session)
    return entitlements_payload(account)


@router.post("/checkout")
def checkout(
    body: CheckoutBody,
    x_session: str | None = Header(default=None, alias="X-Session"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if not stripe_configured():
        raise HTTPException(503, "Stripe is not configured on this instance. Use a license key or contact sales.")
    account = account_for_session(db, x_session)
    if account is None:
        raise HTTPException(401, "Sign in to start a Pro checkout.")
    try:
        session = create_checkout_session(
            customer_email=body.email,
            customer_id=account.stripe_customer_id,
            client_reference_id=str(account.id),
            success_url=body.success_url,
            cancel_url=body.cancel_url,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Stripe checkout failed: {exc}") from exc
    return {"id": session.get("id"), "url": session.get("url")}


@router.post("/portal")
def portal(
    body: PortalBody,
    x_session: str | None = Header(default=None, alias="X-Session"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if not stripe_configured():
        raise HTTPException(503, "Stripe is not configured.")
    account = account_for_session(db, x_session)
    if account is None or not account.stripe_customer_id:
        raise HTTPException(400, "No Stripe customer on this account yet — subscribe first.")
    try:
        session = create_portal_session(customer_id=account.stripe_customer_id, return_url=body.return_url)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Stripe portal failed: {exc}") from exc
    return {"url": session.get("url")}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)) -> dict[str, str]:
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    if not verify_webhook_signature(payload, sig):
        raise HTTPException(400, "Invalid Stripe signature")
    try:
        event = json.loads(payload.decode())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, "Bad JSON") from exc
    etype = event.get("type")
    data = (event.get("data") or {}).get("object") or {}

    if etype == "checkout.session.completed":
        ref = data.get("client_reference_id")
        customer = data.get("customer")
        sub = data.get("subscription")
        if ref and str(ref).isdigit():
            account = db.get(Account, int(ref))
            if account:
                account.plan = "pro"
                account.plan_status = "active"
                if customer:
                    account.stripe_customer_id = str(customer)
                if sub:
                    account.stripe_subscription_id = str(sub)
                db.commit()
    elif etype in {"customer.subscription.updated", "customer.subscription.deleted"}:
        customer = data.get("customer")
        status = data.get("status")
        if customer:
            account = db.query(Account).filter(Account.stripe_customer_id == str(customer)).first()
            if account:
                if status in {"active", "trialing"}:
                    account.plan = "pro"
                    account.plan_status = "active"
                elif status == "past_due":
                    account.plan_status = "past_due"
                else:
                    account.plan = "free"
                    account.plan_status = "canceled"
                    account.stripe_subscription_id = None
                db.commit()
    return {"ok": "true"}


@router.post("/license/activate")
def activate_license(
    body: LicenseBody,
    x_session: str | None = Header(default=None, alias="X-Session"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Redeem a self-host / Pro license onto the signed-in account (and optionally the instance)."""
    try:
        info = verify_license(body.key)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    settings = get_settings()
    if info["plan"] == "self_host" and settings.license_unlocks_instance:
        set_instance_plan("self_host")

    account = account_for_session(db, x_session)
    if account is None:
        if info["plan"] == "self_host" and settings.license_unlocks_instance:
            return {"ok": True, "plan": info["plan"], "instance": True, "licensee": info["licensee"]}
        raise HTTPException(401, "Sign in to attach a license to your account.")

    account.plan = info["plan"] if info["plan"] in {"pro", "self_host"} else "pro"
    account.plan_status = "active"
    account.license_licensee = info["licensee"]
    account.license_key_hint = body.key[-12:]
    db.commit()
    return {
        "ok": True,
        "plan": account.plan,
        "licensee": info["licensee"],
        "entitlements": entitlements_payload(account),
    }


@router.post("/license/issue")
def issue(
    body: IssueLicenseBody,
) -> dict[str, Any]:
    settings = get_settings()
    admin = (settings.billing_admin_token or "").strip()
    if not admin or body.admin_token != admin:
        raise HTTPException(403, "Bad admin token")
    try:
        key = issue_license(licensee=body.licensee, seats=body.seats, exp=body.exp)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"key": key, "licensee": body.licensee, "seats": body.seats}


@router.post("/dev-upgrade")
def dev_upgrade(
    body: DevUpgradeBody,
    x_session: str | None = Header(default=None, alias="X-Session"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Non-production helper to flip plan without Stripe."""
    settings = get_settings()
    if settings.is_production:
        raise HTTPException(403, "Disabled in production")
    account = account_for_session(db, x_session)
    if account is None:
        raise HTTPException(401, "Sign in first")
    account.plan = body.plan
    account.plan_status = "active" if body.plan != "free" else "none"
    db.commit()
    return entitlements_payload(account)
