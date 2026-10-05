"""Performance metrics from equity curve and trade list."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import numpy as np

from app.backtesting.portfolio import EquityPoint
from app.backtesting.positions import TradeRecord


TRADING_DAYS_PER_YEAR = 252


def _safe_float(value: float | None) -> float | None:
    """Convert NaN/inf to None for JSON-safe metrics."""
    if value is None:
        return None
    try:
        if np.isnan(value) or np.isinf(value):
            return None
    except TypeError:
        return None
    return float(value)


def compute_performance_metrics(
    equity_curve: list[EquityPoint],
    trades: list[TradeRecord],
    initial_capital: float,
) -> dict[str, Any]:
    """Compute standard backtest performance statistics."""
    if not equity_curve:
        return _empty_metrics(initial_capital)

    equities = np.array([pt.equity for pt in equity_curve], dtype=float)
    dates = [pt.date for pt in equity_curve]
    final_capital = float(equities[-1])
    total_return = (final_capital / initial_capital) - 1.0 if initial_capital else None

    # Daily returns from equity
    if len(equities) >= 2:
        rets = np.diff(equities) / np.where(equities[:-1] == 0, np.nan, equities[:-1])
        rets = rets[np.isfinite(rets)]
    else:
        rets = np.array([])

    ann_vol = None
    sharpe = None
    sortino = None
    if len(rets) >= 2:
        daily_std = float(np.std(rets, ddof=1))
        ann_vol = daily_std * np.sqrt(TRADING_DAYS_PER_YEAR) if daily_std > 0 else 0.0
        mean_r = float(np.mean(rets))
        if daily_std > 0:
            sharpe = (mean_r / daily_std) * np.sqrt(TRADING_DAYS_PER_YEAR)
        else:
            sharpe = None

        downside = rets[rets < 0]
        if len(downside) >= 1:
            downside_std = float(np.std(downside, ddof=1)) if len(downside) > 1 else float(np.abs(downside[0]))
            if downside_std > 0:
                sortino = (mean_r / downside_std) * np.sqrt(TRADING_DAYS_PER_YEAR)
            else:
                sortino = None
        else:
            # No downside observations
            sortino = None

    # CAGR
    cagr = None
    if len(dates) >= 2 and initial_capital > 0 and final_capital > 0:
        days = max((dates[-1] - dates[0]).total_seconds() / 86400.0, 1.0)
        years = days / 365.25
        if years > 0:
            cagr = (final_capital / initial_capital) ** (1.0 / years) - 1.0

    # Drawdown
    peak = np.maximum.accumulate(equities)
    dd = np.where(peak > 0, equities / peak - 1.0, 0.0)
    max_drawdown = float(dd.min()) if len(dd) else 0.0

    calmar = None
    if cagr is not None and max_drawdown < 0:
        calmar = cagr / abs(max_drawdown)

    # Trade stats
    n_trades = len(trades)
    win_rate = None
    avg_trade_return = None
    profit_factor = None
    avg_win = None
    avg_loss = None

    if n_trades > 0:
        pnls = np.array([t.pnl for t in trades], dtype=float)
        rets_t = np.array([t.return_pct for t in trades], dtype=float)
        wins = pnls[pnls > 0]
        losses = pnls[pnls < 0]
        win_rate = float(np.sum(pnls > 0) / n_trades)
        avg_trade_return = float(np.mean(rets_t))
        gross_profit = float(wins.sum()) if len(wins) else 0.0
        gross_loss = float(np.abs(losses.sum())) if len(losses) else 0.0
        if gross_loss > 0:
            profit_factor = gross_profit / gross_loss
        elif gross_profit > 0:
            profit_factor = None  # infinite → null
        else:
            profit_factor = 0.0
        avg_win = float(wins.mean()) if len(wins) else None
        avg_loss = float(losses.mean()) if len(losses) else None

    return {
        "initial_capital": _safe_float(initial_capital),
        "final_capital": _safe_float(final_capital),
        "total_return": _safe_float(total_return),
        "cagr": _safe_float(cagr),
        "annualized_volatility": _safe_float(ann_vol),
        "sharpe_ratio": _safe_float(sharpe),
        "sortino_ratio": _safe_float(sortino),
        "max_drawdown": _safe_float(max_drawdown),
        "calmar_ratio": _safe_float(calmar),
        "number_of_trades": n_trades,
        "win_rate": _safe_float(win_rate),
        "average_trade_return": _safe_float(avg_trade_return),
        "profit_factor": _safe_float(profit_factor),
        "average_winning_trade": _safe_float(avg_win),
        "average_losing_trade": _safe_float(avg_loss),
        "start_date": dates[0].isoformat() if dates else None,
        "end_date": dates[-1].isoformat() if dates else None,
    }


def _empty_metrics(initial_capital: float) -> dict[str, Any]:
    return {
        "initial_capital": initial_capital,
        "final_capital": initial_capital,
        "total_return": 0.0,
        "cagr": None,
        "annualized_volatility": None,
        "sharpe_ratio": None,
        "sortino_ratio": None,
        "max_drawdown": 0.0,
        "calmar_ratio": None,
        "number_of_trades": 0,
        "win_rate": None,
        "average_trade_return": None,
        "profit_factor": None,
        "average_winning_trade": None,
        "average_losing_trade": None,
        "start_date": None,
        "end_date": None,
    }
