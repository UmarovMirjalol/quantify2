"""Compact copy of the Quantify engine for exported scripts.

Same rules as ``app.backtesting.engine``: signals at the close of bar t fill at the
open of bar t+1, stops/takes are checked intrabar (stop first when both are touched,
gaps fill at the open), slippage worsens every fill, commission is a fraction of
notional, and sizing honours the spec's mode and limits. Only the code between the
standalone markers is copied into exported scripts.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

# --- standalone:start ---
def _size(spec, equity, cash, price, short, fraction):
    risk = spec["risk"]
    slip, comm = spec["slippage"], spec["commission"]
    fill = price * (1.0 - slip) if short else price * (1.0 + slip)
    if fill <= 0 or equity <= 0 or cash <= 0:
        return 0.0, None, None
    unit = fill * (1.0 + comm)
    mode = spec["position_sizing"]
    if fraction is not None:
        qty = equity * max(0.0, min(1.0, fraction)) / unit
    elif mode == "fixed":
        qty = float(risk.get("fixed_shares") or 100)
    elif mode == "percent_capital":
        qty = equity * (risk.get("percent_capital") or 0.1) / unit
    elif spec.get("stop_loss"):
        qty = equity * risk["risk_per_trade"] / (fill * spec["stop_loss"])
    else:
        qty = equity * risk["risk_per_trade"] / unit
    backing = equity if short else cash
    qty = min(
        qty,
        equity * risk["max_position_pct"] / unit,
        equity * risk["max_portfolio_exposure"] / unit,
        backing * risk["max_leverage"] / unit,
    )
    qty = float(int(qty)) if qty >= 1 else math.floor(qty * 1e6) / 1e6
    if qty <= 0 or fill * qty * (1.0 + comm) > backing * risk["max_leverage"] + 1e-9:
        return 0.0, None, None
    stop, take = _stop_take(spec, fill, short)
    return qty, stop, take


def _stop_take(spec, entry, short):
    sign = -1.0 if short else 1.0
    stop = entry * (1.0 - sign * spec["stop_loss"]) if spec.get("stop_loss") is not None else None
    take = entry * (1.0 + sign * spec["take_profit"]) if spec.get("take_profit") is not None else None
    return stop, take


def _bracket_hit(pos, high, low, open_):
    stop, take = pos["stop"], pos["take"]
    if pos["short"]:
        hit_stop = stop is not None and high >= stop
        hit_take = take is not None and low <= take
        gapped_take = hit_take and open_ <= (take or 0) and (stop is None or open_ < stop)
    else:
        hit_stop = stop is not None and low <= stop
        hit_take = take is not None and high >= take
        gapped_take = hit_take and open_ >= (take or 0) and (stop is None or open_ > stop)
    if hit_stop and hit_take:
        return "take_profit" if gapped_take else "stop_loss"
    if hit_stop:
        return "stop_loss"
    if hit_take:
        return "take_profit"
    return None


def backtest(df, spec, entry, exit_, size=None):
    """Run the spec on OHLCV bars with precomputed entry/exit flags. Returns trades and equity."""
    short = spec.get("side") == "short"
    slip, comm = spec["slippage"], spec["commission"]
    cash = float(spec["initial_capital"])
    pos = None
    pending = None
    trades, equity = [], []
    dates = pd.to_datetime(df["date"]).tolist()
    o_, h_, l_, c_ = (df[k].to_numpy(dtype=float) for k in ("open", "high", "low", "close"))
    entry = np.asarray(entry, dtype=bool)
    exit_ = np.asarray(exit_, dtype=bool)

    def fill(raw, sell):
        return raw * (1.0 - slip) if sell else raw * (1.0 + slip)

    def close_position(raw, i, reason):
        nonlocal cash, pos
        px = fill(raw, sell=not pos["short"])
        fee = abs(px * pos["qty"]) * comm
        if pos["short"]:
            cash -= px * pos["qty"] + fee
            pnl = (pos["entry"] - px) * pos["qty"] - fee
            ret = (pos["entry"] - px) / pos["entry"]
        else:
            cash += px * pos["qty"] - fee
            pnl = (px - pos["entry"]) * pos["qty"] - fee
            ret = px / pos["entry"] - 1.0
        trades.append(
            {
                "entry_date": str(dates[pos["bar"]]), "exit_date": str(dates[i]), "side": "short" if pos["short"] else "long",
                "entry_price": pos["entry"], "exit_price": px, "quantity": pos["qty"], "pnl": pnl,
                "return_pct": ret, "exit_reason": reason, "bars_held": i - pos["bar"],
            }
        )
        pos = None

    for i in range(len(df)):
        o, h, l, c = o_[i], h_[i], l_[i], c_[i]
        if pending is not None:
            kind, qty, stop, take = pending
            pending = None
            if kind == "open" and pos is None:
                px = fill(o, sell=short)
                fee = abs(px * qty) * comm
                if short or px * qty + fee <= cash + 1e-6:
                    cash += (px * qty - fee) if short else -(px * qty + fee)
                    if stop is None and take is None:
                        stop, take = _stop_take(spec, px, short)
                    pos = {"short": short, "qty": qty, "entry": px, "bar": i, "stop": stop, "take": take}
            elif kind == "close" and pos is not None:
                close_position(o, i, "exit_signal")

        if pos is not None:
            reason = _bracket_hit(pos, h, l, o)
            if reason is not None:
                level = pos["stop"] if reason == "stop_loss" else pos["take"]
                if reason == "stop_loss":
                    raw = max(o, level) if pos["short"] else min(o, level)
                else:
                    raw = min(o, level) if pos["short"] else max(o, level)
                close_position(raw, i, reason)

        if i < len(df) - 1:
            fraction = float(size[i]) if size is not None else None
            if pos is None and entry[i] and fraction != 0.0:
                qty, stop, take = _size(spec, cash, cash, c, short, fraction)
                if qty > 0:
                    pending = ("open", qty, stop, take)
            elif pos is not None and exit_[i]:
                pending = ("close", pos["qty"], None, None)

        value = 0.0 if pos is None else (-1.0 if pos["short"] else 1.0) * pos["qty"] * c
        equity.append(cash + value)
    return trades, equity


def summarize(equity, trades, initial_capital, periods_per_year=252):
    eq = np.asarray(equity, dtype=float)
    rets = np.diff(eq) / eq[:-1] if eq.size > 1 else np.array([])
    rets = rets[np.isfinite(rets)]
    sd = float(np.std(rets, ddof=1)) if rets.size > 1 else 0.0
    peak = np.maximum.accumulate(eq) if eq.size else eq
    pnls = np.array([t["pnl"] for t in trades], dtype=float)
    return {
        "final_equity": float(eq[-1]) if eq.size else initial_capital,
        "total_return": float(eq[-1] / initial_capital - 1.0) if eq.size else 0.0,
        "sharpe_ratio": float(np.mean(rets) / sd * np.sqrt(periods_per_year)) if sd > 0 else None,
        "max_drawdown": float((eq / peak - 1.0).min()) if eq.size else 0.0,
        "number_of_trades": len(trades),
        "win_rate": float((pnls > 0).mean()) if pnls.size else None,
    }
# --- standalone:end ---
