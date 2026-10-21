"""Playbook, releases, and public pulse endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import get_settings
from app.database import init_db
from app.main import app


def test_playbook_and_releases_public(monkeypatch):
    monkeypatch.setenv("APP_ACCESS_TOKEN", "secret-token-xyz")
    get_settings.cache_clear()
    client = TestClient(app)

    playbook = client.get("/api/playbook")
    assert playbook.status_code == 200
    body = playbook.json()
    assert body["count"] >= 4
    assert body["items"][0]["id"]
    assert body["items"][0]["text"]

    releases = client.get("/api/releases")
    assert releases.status_code == 200
    assert releases.json()["count"] == 20
    assert len(releases.json()["items"]) >= 20

    monkeypatch.delenv("APP_ACCESS_TOKEN", raising=False)
    get_settings.cache_clear()


def test_pulse_returns_items(monkeypatch):
    monkeypatch.delenv("APP_ACCESS_TOKEN", raising=False)
    get_settings.cache_clear()
    init_db()
    client = TestClient(app)
    res = client.get("/api/pulse")
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) >= 1
    assert "strategy" in items[0]
