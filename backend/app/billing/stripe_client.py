"""Minimal Stripe REST client via httpx (no stripe SDK required)."""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any

import httpx

from app.config import get_settings

API = "https://api.stripe.com/v1"


def stripe_configured() -> bool:
    return bool(get_settings().stripe_secret_key.strip())


def _headers() -> dict[str, str]:
    key = get_settings().stripe_secret_key.strip()
    return {"Authorization": f"Bearer {key}"}


def create_checkout_session(
    *,
    customer_email: str | None,
    customer_id: str | None,
    client_reference_id: str,
    success_url: str,
    cancel_url: str,
    price_id: str | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    price = (price_id or settings.stripe_price_pro or "").strip()
    if not price:
        # Fallback: inline price_data when no Price ID configured (test mode)
        data: dict[str, Any] = {
            "mode": "subscription",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "client_reference_id": client_reference_id,
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": "usd",
            "line_items[0][price_data][unit_amount]": "2900",
            "line_items[0][price_data][recurring][interval]": "month",
            "line_items[0][price_data][product_data][name]": "Quantify Pro",
        }
    else:
        data = {
            "mode": "subscription",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "client_reference_id": client_reference_id,
            "line_items[0][price]": price,
            "line_items[0][quantity]": "1",
        }
    if customer_id:
        data["customer"] = customer_id
    elif customer_email:
        data["customer_email"] = customer_email
    with httpx.Client(timeout=30.0) as client:
        res = client.post(f"{API}/checkout/sessions", data=data, headers=_headers())
        res.raise_for_status()
        return res.json()


def create_portal_session(*, customer_id: str, return_url: str) -> dict[str, Any]:
    with httpx.Client(timeout=30.0) as client:
        res = client.post(
            f"{API}/billing_portal/sessions",
            data={"customer": customer_id, "return_url": return_url},
            headers=_headers(),
        )
        res.raise_for_status()
        return res.json()


def verify_webhook_signature(payload: bytes, sig_header: str | None) -> bool:
    secret = get_settings().stripe_webhook_secret.strip()
    if not secret:
        # Dev: accept when webhook secret unset (never in production)
        return not get_settings().is_production
    if not sig_header:
        return False
    parts = dict(p.split("=", 1) for p in sig_header.split(",") if "=" in p)
    timestamp = parts.get("t")
    v1 = parts.get("v1")
    if not timestamp or not v1:
        return False
    try:
        if abs(time.time() - int(timestamp)) > 300:
            return False
    except ValueError:
        return False
    signed = f"{timestamp}.".encode() + payload
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)
