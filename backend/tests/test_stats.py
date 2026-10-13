"""Public live stats endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import get_settings
from app.database import init_db
from app.main import app


def test_stats_baseline_and_ping(monkeypatch):
    monkeypatch.delenv("APP_ACCESS_TOKEN", raising=False)
    get_settings.cache_clear()
    init_db()
    client = TestClient(app)

    before = client.get("/api/stats")
    assert before.status_code == 200
    body = before.json()
    assert body["users"] >= 425
    assert body["backtests"] >= 1195
    assert body["releases"] == 11

    users_before = body["users"]
    ping = client.post("/api/stats/ping", headers={"X-Client-Id": "stats-tester-1"})
    assert ping.status_code == 200
    assert ping.json()["ok"] is True

    after = client.get("/api/stats")
    assert after.status_code == 200
    assert after.json()["users"] >= users_before


def test_stats_public_with_auth(monkeypatch):
    monkeypatch.setenv("APP_ACCESS_TOKEN", "secret-token-xyz")
    get_settings.cache_clear()
    client = TestClient(app)
    res = client.get("/api/stats")
    assert res.status_code == 200
    ping = client.post("/api/stats/ping", headers={"X-Client-Id": "stats-public"})
    assert ping.status_code == 200
    monkeypatch.delenv("APP_ACCESS_TOKEN", raising=False)
    get_settings.cache_clear()
