"""Billing catalog, license keys, entitlements."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.billing.license_keys import issue_license, verify_license
from app.billing.plans import limits_for, plan_catalog
from app.config import get_settings
from app.database import init_db
from app.main import app


def test_plan_catalog_has_three():
    ids = {p["id"] for p in plan_catalog()}
    assert ids == {"free", "pro", "self_host"}
    assert limits_for("free")["farm_jobs"] is False
    assert limits_for("pro")["farm_jobs"] is True


def test_dev_license_key(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    get_settings.cache_clear()
    info = verify_license("PRO-DEV")
    assert info["plan"] == "pro"


def test_signed_license_roundtrip(monkeypatch):
    monkeypatch.setenv("LICENSE_SIGNING_SECRET", "test-secret-please-change")
    get_settings.cache_clear()
    key = issue_license(licensee="Acme", seats=3, exp="2099-01-01")
    info = verify_license(key)
    assert info["licensee"] == "Acme"
    assert info["plan"] == "self_host"
    assert info["seats"] == 3


def test_billing_plans_endpoint(monkeypatch):
    monkeypatch.delenv("APP_ACCESS_TOKEN", raising=False)
    get_settings.cache_clear()
    init_db()
    client = TestClient(app)
    res = client.get("/api/billing/plans")
    assert res.status_code == 200
    body = res.json()
    assert len(body["plans"]) == 3
    assert "billing_enabled" in body
