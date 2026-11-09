"""Unified verdict and public report links."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import get_settings
from app.database import init_db
from app.main import app
from app.research.verdict import build_verdict

PAYLOAD = {
    "strategy_text": "Buy when the 20-day SMA crosses above the 50-day SMA and sell when it crosses below.",
    "dataset_id": "sample_data.csv",
    "config": {"initial_capital": 100000, "commission": 0.001, "slippage": 0.0005, "risk_per_trade": 0.01},
}


def test_verdict_grades_from_the_checks():
    good = build_verdict(
        {"regimes": {"verdict": "both"}, "market": {"verdict": "alpha"}},
        stress={"verdict": "holds"},
        walk={"verdict": "stable"},
        robust={
            "deflated": {"verdict": "survives"},
            "costs": {"verdict": "room"},
            "heatmap": {"available": True, "verdict": "plateau"},
        },
    )
    assert good["grade"] == "robust"
    assert good["score"] == 100

    broken = build_verdict(
        {"regimes": {"verdict": "both"}, "market": {"verdict": "alpha"}},
        stress={"verdict": "overfit"},
        walk={"verdict": "stable"},
        robust={"deflated": {"verdict": "survives"}, "costs": {"verdict": "room"}},
    )
    assert broken["grade"] == "overfit"

    empty = build_verdict({})
    assert empty["grade"] == "insufficient"
    assert all(c["status"] == "skip" for c in empty["checks"])


def test_share_link_is_public_owner_only_and_revocable(monkeypatch):
    monkeypatch.delenv("APP_ACCESS_TOKEN", raising=False)
    get_settings.cache_clear()
    init_db()
    client = TestClient(app)

    run = client.post("/api/backtest", json=PAYLOAD, headers={"X-Client-Id": "sharer"})
    assert run.status_code == 200, run.text
    run_id = run.json()["id"]
    assert run.json()["market"]["verdict"] in {"alpha", "unproven", "beta", "no_edge", "thin"}

    stranger = client.post(f"/api/backtests/{run_id}/share", headers={"X-Client-Id": "someone-else"})
    assert stranger.status_code == 404

    shared = client.post(f"/api/backtests/{run_id}/share", headers={"X-Client-Id": "sharer"})
    assert shared.status_code == 200
    token = shared.json()["token"]

    report = client.get(f"/api/reports/{token}")
    assert report.status_code == 200
    body = report.json()
    assert body["id"] == run_id
    assert body["verdict"]["grade"] in {"robust", "promising", "overfit", "no_edge", "insufficient"}
    assert len(body["verdict"]["checks"]) == 9

    monkeypatch.setenv("APP_ACCESS_TOKEN", "secret-token-xyz")
    get_settings.cache_clear()
    assert client.get(f"/api/reports/{token}").status_code == 200
    monkeypatch.delenv("APP_ACCESS_TOKEN", raising=False)
    get_settings.cache_clear()

    client.delete(f"/api/backtests/{run_id}/share", headers={"X-Client-Id": "sharer"})
    assert client.get(f"/api/reports/{token}").status_code == 404
