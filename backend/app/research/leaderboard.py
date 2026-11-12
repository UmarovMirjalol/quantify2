"""Public leaderboard: every daily playbook strategy on a few popular markets, ranked by the last year."""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from app.backtesting.engine import BacktestEngine
from app.data.market_fetcher import fetch_market_frame
from app.llm.parser import parse_builtin
from app.playbook import PLAYBOOK

TICKERS = ("SPY", "QQQ", "NVDA", "BTC-USD")
YEAR_BARS = {"BTC-USD": 365}
WEEK_BARS = {"BTC-USD": 7}
CAPITAL = 10_000.0
_TTL = 12 * 3600
_LOCK = threading.Lock()
_CACHE: dict[str, Any] = {}


def _metric(out: dict[str, Any], key: str) -> float | None:
    m = out["metrics"]
    value = m.get(key) if isinstance(m, dict) else getattr(m, key, None)
    return float(value) if value is not None else None


def _hold(close: pd.Series, bars: int) -> float:
    window = close.iloc[-(bars + 1):]
    return float(window.iloc[-1] / window.iloc[0] - 1.0)


def _window(engine: BacktestEngine, df: pd.DataFrame, bars: int) -> tuple[float | None, int]:
    start = max(1, len(df) - bars - 1)
    out = engine.run(df, metrics_only=True, trade_from=start, join_at_start=True)
    return _metric(out, "total_return"), int(_metric(out, "number_of_trades") or 0)


def _rows() -> list[dict[str, Any]]:
    frames = {t: fetch_market_frame(t, history="10y")[0] for t in TICKERS}
    rows: list[dict[str, Any]] = []
    for item in PLAYBOOK:
        parsed = parse_builtin(item["text"], initial_capital=CAPITAL, commission=0.001, slippage=0.0005)
        spec = parsed.strategy
        if spec.timeframe not in ("1d", "1D"):
            continue
        for ticker, df in frames.items():
            if len(df) < 300:
                continue
            engine = BacktestEngine(spec)
            year_bars, week_bars = YEAR_BARS.get(ticker, 252), WEEK_BARS.get(ticker, 5)
            close = pd.to_numeric(df["close"], errors="coerce")
            full = engine.run(df, metrics_only=True)
            year_ret, year_trades = _window(engine, df, year_bars)
            week_ret, _ = _window(engine, df, week_bars)
            rows.append(
                {
                    "id": item["id"],
                    "title": item["title"],
                    "tag": item["tag"],
                    "text": item["text"],
                    "ticker": ticker,
                    "return_year": year_ret,
                    "hold_year": _hold(close, year_bars),
                    "trades_year": year_trades,
                    "return_week": week_ret,
                    "hold_week": _hold(close, week_bars),
                    "return_10y": _metric(full, "total_return"),
                    "hold_10y": float(close.iloc[-1] / close.iloc[0] - 1.0),
                    "max_drawdown_10y": _metric(full, "max_drawdown"),
                }
            )
    rows.sort(key=lambda r: r["return_year"] if r["return_year"] is not None else -1e9, reverse=True)
    return rows


def build() -> dict[str, Any]:
    rows = _rows()
    board = {
        "status": "ready",
        "as_of": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "tickers": list(TICKERS),
        "capital": CAPITAL,
        "rows": rows,
        "beat_hold_10y": sum(1 for r in rows if (r["return_10y"] or 0) > r["hold_10y"]),
    }
    _CACHE["board"] = (time.time(), board)
    return board


def _build_in_background() -> None:
    if not _LOCK.acquire(blocking=False):
        return

    def work() -> None:
        try:
            build()
        except Exception as exc:  # noqa: BLE001
            _CACHE["error"] = (time.time(), str(exc))
        finally:
            _LOCK.release()

    threading.Thread(target=work, name="leaderboard", daemon=True).start()


def leaderboard() -> dict[str, Any]:
    """Cached board; a missing or stale one is rebuilt in a background thread (about 20 s)."""
    hit = _CACHE.get("board")
    if hit and time.time() - hit[0] < _TTL:
        return hit[1]
    _build_in_background()
    if hit:
        return hit[1]
    err = _CACHE.get("error")
    if err and time.time() - err[0] < 60 and not _LOCK.locked():
        raise RuntimeError(err[1])
    return {"status": "building"}
