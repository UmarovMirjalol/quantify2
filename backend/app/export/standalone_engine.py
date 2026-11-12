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
def round_quantity(qty):
    return float(int(qty)) if qty >= 1 else math.floor(max(qty, 0.0) * 1e6) / 1e6


def _size(spec, equity, cash, price, short, fraction, held=0.0):
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
        qty = equity * risk["max_position_pct"] / unit
    backing = equity if short else cash
    power = backing * risk["max_leverage"] - (held if short else 0.0)
    qty = min(
        qty,
        (equity * risk["max_position_pct"] - held) / unit,
        (equity * risk["max_portfolio_exposure"] - held) / unit,
        power / unit,
    )
    qty = round_quantity(qty)
    if qty <= 0 or fill * qty * (1.0 + comm) > power + 1e-9:
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

    trailing = spec.get("trailing_stop")
    levels = spec.get("scale_out") or []
    breakeven = spec.get("breakeven_after_scale", False)
    max_entries = spec.get("max_entries", 1)

    def value(price):
        return 0.0 if pos is None else (-1.0 if pos["short"] else 1.0) * pos["qty"] * price

    def tighten(floor_at=None):
        """Stops only move toward profit: trailing level, breakeven after a partial exit."""
        candidates = [floor_at]
        if trailing and pos["best"] is not None:
            candidates.append(pos["best"] * (1.0 + trailing) if pos["short"] else pos["best"] * (1.0 - trailing))
        if breakeven and pos["scaled"] > 0:
            candidates.append(pos["entry"])
        for level in candidates:
            if level is None:
                continue
            if pos["stop"] is None:
                pos["stop"] = level
            else:
                pos["stop"] = min(pos["stop"], level) if pos["short"] else max(pos["stop"], level)

    def close_position(raw, i, reason, qty=None):
        nonlocal cash, pos
        qty = pos["qty"] if qty is None else min(qty, pos["qty"])
        px = fill(raw, sell=not pos["short"])
        fee = abs(px * qty) * comm
        if pos["short"]:
            cash -= px * qty + fee
            pnl = (pos["entry"] - px) * qty - fee
            ret = (pos["entry"] - px) / pos["entry"]
        else:
            cash += px * qty - fee
            pnl = (px - pos["entry"]) * qty - fee
            ret = px / pos["entry"] - 1.0
        trades.append(
            {
                "entry_date": str(dates[pos["bar"]]), "exit_date": str(dates[i]), "side": "short" if pos["short"] else "long",
                "entry_price": pos["entry"], "exit_price": px, "quantity": qty, "pnl": pnl,
                "return_pct": ret, "exit_reason": reason, "bars_held": i - pos["bar"],
            }
        )
        if pos["qty"] - qty > 1e-9:
            pos["qty"] -= qty
        else:
            pos = None

    def scale_out(i, h, l, o):
        sign = -1.0 if pos["short"] else 1.0
        while pos is not None and pos["scaled"] < len(levels):
            level = levels[pos["scaled"]]
            target = pos["entry"] * (1.0 + sign * level["profit"])
            if not (l <= target if pos["short"] else h >= target):
                return
            if pos["base"] is None:
                pos["base"] = pos["qty"]
            qty = min(pos["qty"], round_quantity(pos["base"] * level["fraction"]))
            pos["scaled"] += 1
            if qty <= 0:
                continue
            if pos["qty"] - qty < 1e-9:
                qty = pos["qty"]
            close_position(min(o, target) if pos["short"] else max(o, target), i, "scale_out", qty)
            if pos is not None and breakeven:
                tighten(floor_at=pos["entry"])

    for i in range(len(df)):
        o, h, l, c = o_[i], h_[i], l_[i], c_[i]
        if pending is not None:
            kind, qty, stop, take = pending
            pending = None
            if kind in ("open", "add") and (pos is None) == (kind == "open"):
                px = fill(o, sell=short)
                fee = abs(px * qty) * comm
                if short or px * qty + fee <= cash + 1e-6:
                    cash += (px * qty - fee) if short else -(px * qty + fee)
                    if kind == "add":
                        total = pos["qty"] + qty
                        pos["entry"] = (pos["entry"] * pos["qty"] + px * qty) / total
                        pos["qty"] = total
                        pos["entries"] += 1
                        pos["stop"], pos["take"] = _stop_take(spec, pos["entry"], short)
                    else:
                        if stop is None and take is None:
                            stop, take = _stop_take(spec, px, short)
                        pos = {
                            "short": short, "qty": qty, "entry": px, "bar": i, "stop": stop, "take": take,
                            "entries": 1, "best": px, "base": None, "scaled": 0,
                        }
                    tighten()
            elif kind == "close" and pos is not None:
                close_position(o, i, "exit_signal")

        if pos is not None:
            reason = _bracket_hit(pos, h, l, o)
            if reason == "stop_loss":
                close_position(max(o, pos["stop"]) if pos["short"] else min(o, pos["stop"]), i, reason)
            else:
                scale_out(i, h, l, o)
                if reason == "take_profit" and pos is not None:
                    close_position(min(o, pos["take"]) if pos["short"] else max(o, pos["take"]), i, reason)

        if i < len(df) - 1:
            fraction = float(size[i]) if size is not None else None
            if pos is None and entry[i] and fraction != 0.0:
                qty, stop, take = _size(spec, cash, cash, c, short, fraction)
                if qty > 0:
                    pending = ("open", qty, stop, take)
            elif pos is not None and exit_[i]:
                pending = ("close", pos["qty"], None, None)
            elif pos is not None and entry[i] and fraction != 0.0 and pos["entries"] < max_entries:
                qty, _, _ = _size(spec, cash + value(c), cash, c, short, fraction, held=pos["qty"] * c)
                if qty > 0:
                    pending = ("add", qty, None, None)

        equity.append(cash + value(c))
        if pos is not None:
            pos["best"] = min(pos["best"], l) if pos["short"] else max(pos["best"], h)
            tighten()
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
