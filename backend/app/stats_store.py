"""Durable public counters for Vercel (multi-instance safe).

On Vercel, SQLite under /tmp is per-instance and resets on cold start, so the
landing counters would flicker or drop. When Upstash Redis REST credentials are
set, visitor + backtest totals live in Redis and survive across instances.

Falls back to SQLite counts when Redis is not configured (local / Docker).
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

VISITORS_KEY = "quantify:visitors"
BACKTESTS_KEY = "quantify:backtests"


def redis_configured() -> bool:
    return bool(
        os.environ.get("UPSTASH_REDIS_REST_URL", "").strip()
        and os.environ.get("UPSTASH_REDIS_REST_TOKEN", "").strip()
    )


def _redis_cmd(command: list[Any]) -> Any:
    url = os.environ["UPSTASH_REDIS_REST_URL"].rstrip("/")
    token = os.environ["UPSTASH_REDIS_REST_TOKEN"]
    with httpx.Client(timeout=8.0) as client:
        res = client.post(
            url,
            headers={"Authorization": f"Bearer {token}"},
            json=command,
        )
        res.raise_for_status()
        payload = res.json()
        if "error" in payload:
            raise RuntimeError(payload["error"])
        return payload.get("result")


def record_visitor(client_id: str) -> None:
    """Remember a unique browser id (no-op for anonymous)."""
    if not client_id or client_id == "_anonymous":
        return
    if not redis_configured():
        return
    try:
        _redis_cmd(["SADD", VISITORS_KEY, client_id])
    except Exception:
        logger.exception("redis record_visitor failed")


def record_backtest() -> None:
    """Bump the global backtest counter by one."""
    if not redis_configured():
        return
    try:
        _redis_cmd(["INCR", BACKTESTS_KEY])
    except Exception:
        logger.exception("redis record_backtest failed")


def redis_counts() -> tuple[int, int] | None:
    """Return (users_live, backtests_live) from Redis, or None if unavailable."""
    if not redis_configured():
        return None
    try:
        users = int(_redis_cmd(["SCARD", VISITORS_KEY]) or 0)
        backtests = int(_redis_cmd(["GET", BACKTESTS_KEY]) or 0)
        return users, backtests
    except Exception:
        logger.exception("redis_counts failed")
        return None


def sqlite_counts(db: Session) -> tuple[int, int]:
    """Fallback counts from the local SQLite/Postgres session."""
    from app.models.backtest import BacktestRecord
    from app.models.stats import Visitor

    users_live = db.query(Visitor).count()
    bt_clients = (
        db.query(func.count(distinct(BacktestRecord.client_id)))
        .filter(BacktestRecord.client_id != "")
        .scalar()
        or 0
    )
    users_live = max(users_live, int(bt_clients))
    backtests_live = db.query(BacktestRecord).count()
    return users_live, int(backtests_live)
