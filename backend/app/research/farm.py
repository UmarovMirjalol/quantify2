"""Research farm: one strategy × many tickers, or many playbook rules × a universe."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import pandas as pd

from app.backtesting.engine import BacktestEngine, BacktestError
from app.data.market_fetcher import fetch_market_frame
from app.llm.parser import parse_builtin
from app.llm.schemas import StrategySpec
from app.playbook import PLAYBOOK
from app.research.screener import UNIVERSES

MAX_TICKERS = 80
MAX_RULES = 40
WORKERS = 10


def _symbols(universe: str | None, tickers: list[str]) -> list[str]:
    out: list[str] = []
    if universe:
        if universe not in UNIVERSES:
            raise ValueError(f"Unknown universe: {universe}")
        out.extend(UNIVERSES[universe]["tickers"])
    out.extend(t.strip().upper() for t in tickers if t.strip())
    # Preserve order, drop dupes.
    return list(dict.fromkeys(out))[:MAX_TICKERS]


def _metrics_only(strategy: StrategySpec, df: pd.DataFrame) -> dict[str, Any]:
    return BacktestEngine(strategy).run(df, metrics_only=True)


def _one_ticker(strategy: StrategySpec, symbol: str, history: str) -> dict[str, Any]:
    try:
        df, source = fetch_market_frame(symbol, history=history)
    except Exception as exc:  # noqa: BLE001
        return {"ticker": symbol, "error": f"No data: {exc}"[:160]}
    if len(df) < 60:
        return {"ticker": symbol, "error": "Too little history."}
    try:
        out = _metrics_only(strategy, df)
    except (BacktestError, ValueError) as exc:
        return {"ticker": symbol, "error": str(exc)[:160]}
    m, sig = out["metrics"], out["live_signal"]
    closes = pd.to_numeric(df["close"], errors="coerce")
    hold = float(closes.iloc[-1] / closes.iloc[0] - 1.0) if closes.iloc[0] else None
    return {
        "ticker": symbol,
        "source": source,
        "bars": len(df),
        "action": sig["action"],
        "total_return": m.get("total_return"),
        "buy_hold_return": hold,
        "sharpe_ratio": m.get("sharpe_ratio"),
        "max_drawdown": m.get("max_drawdown"),
        "trades": int(m.get("number_of_trades") or 0),
        "cagr": m.get("cagr"),
        "alpha_vs_hold": None
        if hold is None or m.get("total_return") is None
        else float(m["total_return"]) - float(hold),
    }


def run_farm(
    strategy: StrategySpec,
    *,
    universe: str | None = None,
    tickers: list[str] | None = None,
    history: str = "5y",
) -> dict[str, Any]:
    """Run one strategy across a large ticker set; rank by Sharpe then alpha vs hold."""
    symbols = _symbols(universe, tickers or [])
    if not symbols:
        raise ValueError("Pick a universe or at least one ticker.")
    rows: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=min(WORKERS, len(symbols))) as pool:
        futs = {pool.submit(_one_ticker, strategy, s, history): s for s in symbols}
        for fut in as_completed(futs):
            rows.append(fut.result())
    ok = [r for r in rows if "error" not in r]
    failed = [r for r in rows if "error" in r]
    ok.sort(key=lambda r: (r.get("sharpe_ratio") is None, -(r.get("sharpe_ratio") or -99)))
    beat = sum(1 for r in ok if (r.get("alpha_vs_hold") or 0) > 0)
    return {
        "mode": "strategy_x_tickers",
        "scanned": len(rows),
        "ok": len(ok),
        "failed": failed,
        "beat_hold": beat,
        "beat_hold_share": None if not ok else round(beat / len(ok), 4),
        "history": history,
        "rows": ok,
    }


def run_playbook_farm(
    *,
    universe: str | None = "etfs",
    tickers: list[str] | None = None,
    history: str = "5y",
    max_rules: int = 20,
) -> dict[str, Any]:
    """Every daily playbook rule × every ticker — research-farm grid."""
    symbols = _symbols(universe, tickers or [])
    if not symbols:
        raise ValueError("Pick a universe or at least one ticker.")
    rules = [p for p in PLAYBOOK if "15-minute" not in p.get("text", "").lower() and "15m" not in p.get("text", "")][
        : max(1, min(max_rules, MAX_RULES))
    ]
    grid: list[dict[str, Any]] = []

    def job(item: dict[str, Any], symbol: str) -> dict[str, Any]:
        parsed = parse_builtin(item["text"], initial_capital=10_000, commission=0.001, slippage=0.0005)
        if parsed.strategy.timeframe not in ("1d", "1D"):
            return {"id": item["id"], "ticker": symbol, "error": "non-daily"}
        row = _one_ticker(parsed.strategy, symbol, history)
        row.update({"id": item["id"], "title": item["title"], "tag": item.get("tag"), "text": item["text"]})
        return row

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futs = [pool.submit(job, item, sym) for item in rules for sym in symbols]
        for fut in as_completed(futs):
            grid.append(fut.result())

    ok = [r for r in grid if "error" not in r]
    failed = [r for r in grid if "error" in r]
    ok.sort(key=lambda r: (r.get("sharpe_ratio") is None, -(r.get("sharpe_ratio") or -99)))
    return {
        "mode": "playbook_x_universe",
        "rules": len(rules),
        "tickers": symbols,
        "scanned": len(grid),
        "ok": len(ok),
        "failed_count": len(failed),
        "failed": failed[:20],
        "history": history,
        "rows": ok[:200],
        "top": ok[:25],
    }
