"""Security middleware tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def test_health_public_without_token(monkeypatch):
    monkeypatch.setenv("APP_ACCESS_TOKEN", "secret-token-xyz")
    get_settings.cache_clear()
    client = TestClient(app)
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["auth_required"] is True
    get_settings.cache_clear()


def test_protected_route_requires_token(monkeypatch):
    monkeypatch.setenv("APP_ACCESS_TOKEN", "secret-token-xyz")
    get_settings.cache_clear()
    # Rebuild middleware settings by creating fresh client after cache clear
    from importlib import reload
    import app.main as main_mod
    import app.security as sec_mod

    reload(sec_mod)
    # Middleware reads settings per-request, so reload not strictly needed
    client = TestClient(app)
    denied = client.get("/api/datasets")
    assert denied.status_code == 401
    ok = client.get("/api/datasets", headers={"Authorization": "Bearer secret-token-xyz"})
    assert ok.status_code == 200
    monkeypatch.delenv("APP_ACCESS_TOKEN", raising=False)
    get_settings.cache_clear()


def test_client_isolation_header(monkeypatch):
    """Backtests are scoped by X-Client-Id."""
    monkeypatch.delenv("APP_ACCESS_TOKEN", raising=False)
    get_settings.cache_clear()
    from app.database import init_db

    init_db()
    client = TestClient(app)
    payload = {
        "strategy_text": "Buy when the 20-day SMA crosses above the 50-day SMA and sell when it crosses below.",
        "dataset_id": "sample_data.csv",
        "config": {
            "initial_capital": 100000,
            "commission": 0.001,
            "slippage": 0.0005,
            "risk_per_trade": 0.01,
        },
    }
    a = client.post("/api/backtest", json=payload, headers={"X-Client-Id": "userA"})
    assert a.status_code == 200, a.text
    id_a = a.json()["id"]
    b_list = client.get("/api/backtests", headers={"X-Client-Id": "userB"})
    assert b_list.status_code == 200
    assert id_a not in [x["id"] for x in b_list.json()]
    a_list = client.get("/api/backtests", headers={"X-Client-Id": "userA"})
    assert id_a in [x["id"] for x in a_list.json()]
    forbidden = client.get(f"/api/backtests/{id_a}", headers={"X-Client-Id": "userB"})
    assert forbidden.status_code == 404
