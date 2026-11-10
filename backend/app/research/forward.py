"""Forward test: score a rule set only on bars that arrived after it was saved."""

from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd

from app.backtesting.engine import BacktestEngine
from app.llm.schemas import StrategySpec

WARMUP_HISTORY = "5y"


def start_index(df: pd.DataFrame, start_date: str) -> int:
    """First bar on or after ``start_date``; signals at its close are the first that count."""
    dates = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    hits = (dates >= start_date).to_numpy().nonzero()[0]
    return int(hits[0]) if hits.size else len(df) - 1


def evaluate_forward(strategy: StrategySpec, data: pd.DataFrame, start_date: str) -> dict[str, Any]:
    df = data.reset_index(drop=True)
    k = start_index(df, start_date)
    result = BacktestEngine(strategy).run(df, trade_from=k, join_at_start=True)

    curve = result["equity_curve"][k:]
    closes = pd.to_numeric(df["close"], errors="coerce").to_numpy(dtype=float)
    base_equity = float(curve[0]["equity"]) if curve else strategy.initial_capital
    base_close = float(closes[k])
    equity = [{"date": pt["date"][:10], "equity": float(pt["equity"])} for pt in curve]
    hold = [
        {"date": pt["date"], "equity": base_equity * float(closes[k + i]) / base_close}
        for i, pt in enumerate(equity)
    ]

    peak, max_dd = base_equity, 0.0
    for pt in equity:
        peak = max(peak, pt["equity"])
        max_dd = min(max_dd, pt["equity"] / peak - 1.0 if peak > 0 else 0.0)

    trades = [t for t in result["trades"] if t["entry_date"][:10] > start_date]
    wins = sum(1 for t in trades if t["pnl"] > 0)
    last = equity[-1]["date"] if equity else start_date
    days = (date.fromisoformat(last) - date.fromisoformat(start_date)).days
    return {
        "start_date": start_date,
        "as_of": last,
        "days_live": days,
        "bars_live": max(0, len(df) - 1 - k),
        "forward_return": (equity[-1]["equity"] / base_equity - 1.0) if equity else 0.0,
        "hold_return": float(closes[-1] / base_close - 1.0),
        "max_drawdown": max_dd,
        "trades": trades,
        "closed_trades": len(trades),
        "win_rate": (wins / len(trades)) if trades else None,
        "live_signal": result["live_signal"],
        "equity": equity,
        "hold": hold,
    }
