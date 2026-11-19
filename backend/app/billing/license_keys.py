"""Self-host license keys (model A).

Format: ``QNT1.<base64url(payload_json)>.<hex_hmac>``

Payload example::
    {"plan": "self_host", "licensee": "Acme", "seats": 5, "exp": "2027-01-15"}

Signed with ``LICENSE_SIGNING_SECRET``. In development, ``PRO-DEV`` unlocks Pro without a signature.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import date, datetime, timezone
from typing import Any

from app.config import get_settings


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64url_decode(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def issue_license(
    *,
    licensee: str,
    seats: int = 1,
    exp: str | None = None,
    plan: str = "self_host",
    secret: str | None = None,
) -> str:
    settings = get_settings()
    key = (secret or settings.license_signing_secret or "").strip()
    if not key:
        raise ValueError("LICENSE_SIGNING_SECRET is not configured")
    payload = {
        "plan": plan,
        "licensee": licensee[:120],
        "seats": max(1, int(seats)),
        "exp": exp or f"{date.today().year + 1}-12-31",
        "iss": "quantify",
    }
    body = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(key.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"QNT1.{body}.{sig}"


def verify_license(token: str) -> dict[str, Any]:
    settings = get_settings()
    cleaned = (token or "").strip()
    if not cleaned:
        raise ValueError("Empty license key")

    if cleaned.upper() in {"PRO-DEV", "QNT-PRO-DEV"} and not settings.is_production:
        return {
            "plan": "pro",
            "licensee": "development",
            "seats": 99,
            "exp": None,
            "dev": True,
        }

    if not cleaned.startswith("QNT1."):
        raise ValueError("Unrecognized license format")

    parts = cleaned.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed license key")
    _, body, sig = parts
    secret = (settings.license_signing_secret or "").strip()
    if not secret:
        raise ValueError("Server cannot verify licenses (LICENSE_SIGNING_SECRET missing)")
    expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise ValueError("Invalid license signature")
    try:
        payload = json.loads(_b64url_decode(body).decode())
    except Exception as exc:  # noqa: BLE001
        raise ValueError("Corrupt license payload") from exc
    if not isinstance(payload, dict):
        raise ValueError("Corrupt license payload")
    exp = payload.get("exp")
    if exp:
        try:
            if date.fromisoformat(str(exp)[:10]) < datetime.now(timezone.utc).date():
                raise ValueError("License expired")
        except ValueError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise ValueError("Bad license expiry") from exc
    plan = payload.get("plan") or "self_host"
    if plan not in {"pro", "self_host"}:
        plan = "self_host"
    return {
        "plan": plan,
        "licensee": str(payload.get("licensee") or "licensee")[:120],
        "seats": int(payload.get("seats") or 1),
        "exp": exp,
        "dev": False,
    }
