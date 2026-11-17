"""Paper trading bridge: live_signal snapshot + optional webhook POST."""

from __future__ import annotations

import json
import urllib.request
from typing import Any

import pandas as pd

from app.backtesting.engine import BacktestEngine, BacktestError
from app.data.market_fetcher import fetch_market_frame
from app.llm.schemas import StrategySpec


def paper_signal(
    strategy: StrategySpec,
    ticker: str,
    *,
    history: str = "2y",
) -> dict[str, Any]:
    """Fresh bars → engine live_signal for the next open."""
    df, source = fetch_market_frame(ticker, history=history)
    out = BacktestEngine(strategy).run(df, metrics_only=True)
    sig = out["live_signal"]
    return {
        "ticker": ticker.upper(),
        "source": source,
        "as_of": sig.get("as_of"),
        "action": sig.get("action"),
        "side": sig.get("side"),
        "in_position": sig.get("in_position"),
        "last_close": sig.get("last_close"),
        "entry_price": sig.get("entry_price"),
        "unrealized_pct": sig.get("unrealized_pct"),
        "order_for_next_open": sig.get("order_for_next_open") or sig.get("next_order"),
        "metrics_snapshot": {
            "sharpe_ratio": out["metrics"].get("sharpe_ratio"),
            "total_return": out["metrics"].get("total_return"),
            "trades": out["metrics"].get("number_of_trades"),
        },
    }


def post_webhook(url: str, payload: dict[str, Any], timeout: float = 8.0) -> dict[str, Any]:
    """Fire-and-forget style POST; returns HTTP status info."""
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "QuantifyPaperBridge/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return {"ok": True, "status": getattr(resp, "status", 200)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:200]}


def paper_bridge(
    strategy: StrategySpec,
    tickers: list[str],
    *,
    webhook_url: str | None = None,
    history: str = "2y",
) -> dict[str, Any]:
    signals: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for raw in tickers:
        ticker = raw.strip().upper()
        if not ticker:
            continue
        try:
            signals.append(paper_signal(strategy, ticker, history=history))
        except (BacktestError, ValueError, RuntimeError) as exc:
            errors.append({"ticker": ticker, "error": str(exc)[:160]})
    actionable = [s for s in signals if s.get("action") in ("enter", "exit", "add")]
    webhook = None
    if webhook_url and actionable:
        webhook = post_webhook(
            webhook_url,
            {
                "source": "quantify",
                "event": "paper_signals",
                "count": len(actionable),
                "signals": actionable,
            },
        )
    return {
        "signals": signals,
        "actionable": actionable,
        "errors": errors,
        "webhook": webhook,
    }
