"""Split closed trades by the trend that was known at the signal bar.

A fill happens at the next open, so the regime is the prior close versus its
simple moving average. That bar is already finished when the order is sent.
"""

from __future__ import annotations

from typing import Any

DEFAULT_WINDOW = 50
SHORT_WINDOW = 20


def classify_regimes(
    prices: list[dict[str, Any]],
    trades: list[dict[str, Any]],
    window: int = DEFAULT_WINDOW,
) -> dict[str, Any]:
    dates = [str(bar.get("date") or "")[:10] for bar in prices]
    closes = [float(bar["close"]) for bar in prices]
    used = window if len(closes) >= window + 2 else SHORT_WINDOW
    if len(closes) < used + 2:
        return _empty(used, "Not enough bars to place trades on a finished moving average.")

    average = _sma(closes, used)
    index = {day: i for i, day in enumerate(dates)}
    grouped: dict[str, list[dict[str, Any]]] = {"up": [], "down": []}
    for trade in trades:
        signal = _signal_index(str(trade.get("entry_date") or "")[:10], dates, index)
        if signal is None or average[signal] is None:
            continue
        regime = "up" if closes[signal] > float(average[signal]) else "down"
        grouped[regime].append(trade)

    up = _bucket(grouped["up"])
    down = _bucket(grouped["down"])
    verdict, headline = _verdict(up, down, used)
    return {
        "verdict": verdict,
        "headline": headline,
        "window": used,
        "up": up,
        "down": down,
    }


def _sma(closes: list[float], window: int) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    total = 0.0
    for i, close in enumerate(closes):
        total += close
        if i >= window:
            total -= closes[i - window]
        if i >= window - 1:
            out[i] = total / window
    return out


def _signal_index(entry: str, dates: list[str], index: dict[str, int]) -> int | None:
    if not entry:
        return None
    found = index.get(entry)
    if found is None:
        found = next((i for i, day in enumerate(dates) if day >= entry), None)
    if found is None or found < 1:
        return None
    return found - 1


def _bucket(trades: list[dict[str, Any]]) -> dict[str, Any]:
    pnl = sum(float(trade.get("pnl") or 0) for trade in trades)
    wins = sum(1 for trade in trades if float(trade.get("pnl") or 0) > 0)
    count = len(trades)
    return {
        "trades": count,
        "pnl": pnl,
        "win_rate": (wins / count) if count else None,
    }


def _verdict(up: dict[str, Any], down: dict[str, Any], window: int) -> tuple[str, str]:
    if up["trades"] + down["trades"] < 3:
        return (
            "thin",
            f"Fewer than three trades land on a finished {window}-day average, so the split is not evidence.",
        )
    up_pnl = float(up["pnl"])
    down_pnl = float(down["pnl"])
    label = f"{window}-day average"
    if up_pnl > 0 and down_pnl > 0:
        return (
            "both",
            f"The rules made money both above and below the {label}. The profit is not a one-regime accident.",
        )
    if up_pnl > 0 >= down_pnl and up["trades"] >= 2:
        return (
            "uptrend",
            f"The profit showed up while price was above its {label}. Below that average the same rules did not pay.",
        )
    if down_pnl > 0 >= up_pnl and down["trades"] >= 2:
        return (
            "downtrend",
            f"The profit is concentrated below the {label}. In uptrends these rules did not pay.",
        )
    return (
        "neither",
        f"Neither side of the {label} saves the strategy. The result is not hiding in only one kind of market.",
    )


def _empty(window: int, headline: str) -> dict[str, Any]:
    blank = {"trades": 0, "pnl": 0.0, "win_rate": None}
    return {"verdict": "thin", "headline": headline, "window": window, "up": blank, "down": blank}
