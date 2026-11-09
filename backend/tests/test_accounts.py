"""Accounts: history follows the user across browsers, and an account id is not a credential."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.config import get_settings
from app.database import init_db
from app.main import app

RUN = {
    "strategy_text": "Buy when RSI falls below 30 and sell when RSI rises above 70",
    "dataset_id": "sample_data.csv",
}


def test_account_carries_history_between_browsers(monkeypatch):
    monkeypatch.delenv("APP_ACCESS_TOKEN", raising=False)
    get_settings.cache_clear()
    init_db()
    client = TestClient(app)
    laptop = f"anon-{uuid.uuid4().hex}"
    name = f"user_{uuid.uuid4().hex[:10]}"
    password = "correct horse battery"

    run = client.post("/api/backtest", json=RUN, headers={"X-Client-Id": laptop})
    assert run.status_code == 200, run.text
    run_id = run.json()["id"]

    signup = client.post("/api/auth/register", json={"username": name, "password": password, "claim_client_id": laptop})
    assert signup.status_code == 200, signup.text
    account = signup.json()
    assert account["moved"] == 1 and account["client_id"].startswith("acct-")
    assert client.post("/api/auth/register", json={"username": name, "password": password}).status_code == 409

    phone = client.post("/api/auth/login", json={"username": name.upper(), "password": password}).json()
    phone_headers = {"X-Client-Id": phone["client_id"], "X-Session": phone["token"]}
    history = client.get("/api/backtests", headers=phone_headers)
    assert history.status_code == 200
    assert run_id in [b["id"] for b in history.json()]
    me = client.get("/api/auth/me", headers={"X-Session": phone["token"]}).json()
    assert me["signed_in"] and me["username"] == name and me["backtests"] >= 1

    assert client.get("/api/backtests", headers={"X-Client-Id": laptop}).json() == []
    assert client.get("/api/backtests", headers={"X-Client-Id": account["client_id"]}).status_code == 403
    assert client.get("/api/backtests", headers={"X-Client-Id": account["client_id"], "X-Session": "forged"}).status_code == 403
    assert client.post("/api/auth/login", json={"username": name, "password": "wrong password"}).status_code == 403

    client.post("/api/auth/logout", headers={"X-Session": phone["token"]})
    assert client.get("/api/backtests", headers=phone_headers).status_code == 403
    assert client.get("/api/auth/me", headers={"X-Session": phone["token"]}).json() == {"signed_in": False}
    laptop_headers = {"X-Client-Id": account["client_id"], "X-Session": account["token"]}
    assert client.get("/api/backtests", headers=laptop_headers).status_code == 200
