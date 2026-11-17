"""Published benchmark suite: fixed playbook rules × fixed markets, cacheable."""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any

from app.backtesting.engine import BacktestEngine
from app.data.market_fetcher import fetch_market_frame
from app.llm.parser import parse_builtin
from app.playbook import PLAYBOOK
from app.research.risk_stats import portfolio_risk_report

SUITE_TICKERS = ("SPY", "QQQ", "IWM", "EEM", "GLD", "TLT", "XLE", "BTC-USD", "ETH-USD")
_TTL = 12 * 3600
_LOCK = threading.Lock()
_CACHE: dict[str, Any] = {}


def _daily_items() -> list[dict[str, Any]]:
    out = []
    for item in PLAYBOOK:
        text = item.get("text", "")
        if "15-minute" in text.lower() or "15m" in text.lower() or "4-hour" in text.lower():
            continue
        out.append(item)
    return out[:18]


def build_suite(*, force: bool = False) -> dict[str, Any]:
    now = time.time()
    cached = _CACHE.get("suite")
    if not force and cached and now - cached[0] < _TTL:
        return cached[1]

    rows: list[dict[str, Any]] = []
    frames = {}
    for t in SUITE_TICKERS:
        try:
            frames[t] = fetch_market_frame(t, history="10y")[0]
        except Exception:  # noqa: BLE001
            continue

    for item in _daily_items():
        parsed = parse_builtin(item["text"], initial_capital=10_000, commission=0.001, slippage=0.0005)
        spec = parsed.strategy
        if spec.timeframe not in ("1d", "1D"):
            continue
        engine = BacktestEngine(spec)
        for ticker, df in frames.items():
            if len(df) < 300:
                continue
            try:
                out = engine.run(df, metrics_only=False)
            except Exception:  # noqa: BLE001
                continue
            m = out["metrics"]
            risk = portfolio_risk_report(out["equity_curve"])
            closes = df["close"]
            hold = float(closes.iloc[-1] / closes.iloc[0] - 1.0) if closes.iloc[0] else None
            rows.append(
                {
                    "id": item["id"],
                    "title": item["title"],
                    "ticker": ticker,
                    "sharpe": m.get("sharpe_ratio"),
                    "total_return": m.get("total_return"),
                    "max_drawdown": m.get("max_drawdown"),
                    "trades": m.get("number_of_trades"),
                    "buy_hold": hold,
                    "beat_hold": None
                    if hold is None or m.get("total_return") is None
                    else float(m["total_return"]) > float(hold),
                    "var_95": (risk.get("tails") or {}).get("0.95", {}).get("var_pct"),
                }
            )

    rows.sort(key=lambda r: r["sharpe"] if r["sharpe"] is not None else -99, reverse=True)
    beat = sum(1 for r in rows if r.get("beat_hold"))
    board = {
        "status": "ready",
        "as_of": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "tickers": list(frames.keys()),
        "rows": rows,
        "count": len(rows),
        "beat_hold": beat,
        "beat_hold_share": None if not rows else round(beat / len(rows), 4),
    }
    _CACHE["suite"] = (now, board)
    return board


def suite(force: bool = False) -> dict[str, Any]:
    cached = _CACHE.get("suite")
    if cached and not force and time.time() - cached[0] < _TTL:
        return cached[1]
    if not _LOCK.acquire(blocking=False):
        return cached[1] if cached else {"status": "building", "rows": [], "count": 0}

    def work() -> None:
        try:
            build_suite(force=True)
        finally:
            _LOCK.release()

    if force or not cached:
        threading.Thread(target=work, daemon=True).start()
        if cached:
            return {**cached[1], "status": "refreshing"}
        return {"status": "building", "rows": [], "count": 0}
    _LOCK.release()
    return cached[1]
