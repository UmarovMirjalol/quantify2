"""Synthetic markets: rerun the rules on alternate histories of the same asset.

Each path is a block bootstrap of the real bars. Bars are stored as ratios to the
previous close, blocks of consecutive bars are drawn at random, and prices are
rebuilt from the first close. Short-term behaviour (volatility, gaps, momentum
inside a block) survives; the one specific sequence of years does not. A real
edge should pay on most of these alternate histories, not only on the one that
happened.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.backtesting.engine import BacktestEngine, BacktestError
from app.llm.schemas import StrategySpec
from app.strategies.sandbox import run_custom_batch

MIN_BARS = 120
PATHS = 100
MIN_PATHS = 40
BAR_BUDGET_PER_PATH = 2_600
BLOCK = 20


def _pcts(values: np.ndarray) -> dict[str, float]:
    if values.size == 0:
        return {"p5": 0.0, "p25": 0.0, "p50": 0.0, "p75": 0.0, "p95": 0.0}
    p5, p25, p50, p75, p95 = np.percentile(values, [5, 25, 50, 75, 95])
    return {
        "p5": round(float(p5), 4),
        "p25": round(float(p25), 4),
        "p50": round(float(p50), 4),
        "p75": round(float(p75), 4),
        "p95": round(float(p95), 4),
    }


def _histogram(values: np.ndarray, bins: int = 20) -> dict[str, list[float]]:
    if values.size == 0:
        return {"edges": [], "counts": []}
    counts, edges = np.histogram(values, bins=bins)
    return {"edges": [round(float(e), 4) for e in edges], "counts": [int(c) for c in counts]}


def synthetic_path(data: pd.DataFrame, rng: np.random.Generator, block: int = BLOCK) -> pd.DataFrame:
    df = data.reset_index(drop=True)
    n = len(df)
    close = df["close"].to_numpy(dtype=float)
    prev = close[:-1]
    o = df["open"].to_numpy(dtype=float)[1:] / prev
    h = df["high"].to_numpy(dtype=float)[1:] / prev
    lo = df["low"].to_numpy(dtype=float)[1:] / prev
    c = close[1:] / prev
    vol = df["volume"].to_numpy(dtype=float)[1:] if "volume" in df.columns else np.zeros(n - 1)

    steps = n - 1
    block = max(1, min(block, steps))
    starts = rng.integers(0, steps - block + 1, size=steps // block + 1)
    idx = np.concatenate([np.arange(s, s + block) for s in starts])[:steps]

    closes = close[0] * np.cumprod(c[idx])
    prevs = np.concatenate([[close[0]], closes[:-1]])
    return pd.DataFrame(
        {
            "date": df["date"],
            "open": np.concatenate([[df["open"].iloc[0]], prevs * o[idx]]),
            "high": np.concatenate([[df["high"].iloc[0]], prevs * h[idx]]),
            "low": np.concatenate([[df["low"].iloc[0]], prevs * lo[idx]]),
            "close": np.concatenate([[close[0]], closes]),
            "volume": np.concatenate([[vol[0] if vol.size else 0.0], vol[idx]]),
        }
    )


def run_synthetic(
    strategy: StrategySpec,
    data: pd.DataFrame,
    *,
    paths: int = PATHS,
    block: int = BLOCK,
    seed: int = 0,
) -> dict[str, Any]:
    df = data.reset_index(drop=True)
    if len(df) < MIN_BARS:
        raise ValueError(f"Need at least {MIN_BARS} bars to build synthetic markets.")
    real = BacktestEngine(strategy).run(df, metrics_only=True)["metrics"]
    real_return = float(real.get("total_return") or 0.0)
    real_sharpe = float(real.get("sharpe_ratio") or 0.0)

    # Long histories cost more per path; keep the total work near PATHS x BAR_BUDGET_PER_PATH bars.
    paths = min(paths, max(MIN_PATHS, (PATHS * BAR_BUDGET_PER_PATH) // len(df)))
    rng = np.random.default_rng(seed)
    returns: list[float] = []
    sharpes: list[float] = []
    trades: list[int] = []
    holds: list[float] = []
    frames = [synthetic_path(df, rng, block) for _ in range(paths)]
    precomputed = (
        run_custom_batch(strategy.custom_code or "", frames) if strategy.is_custom else [None] * len(frames)
    )
    for frame, signals in zip(frames, precomputed):
        try:
            metrics = BacktestEngine(strategy).run(frame, signals=signals, metrics_only=True)["metrics"]
        except (BacktestError, ValueError):
            continue
        returns.append(float(metrics.get("total_return") or 0.0))
        sharpes.append(float(metrics.get("sharpe_ratio") or 0.0))
        trades.append(int(metrics.get("number_of_trades") or 0))
        holds.append(float(frame["close"].iloc[-1] / frame["close"].iloc[0] - 1.0))

    r = np.asarray(returns)
    s = np.asarray(sharpes)
    profitable = float((r > 0).mean()) if r.size else 0.0
    rank = float((r < real_return).mean()) if r.size else 0.0
    median_trades = float(np.median(trades)) if trades else 0.0
    median_sharpe = float(np.median(s)) if s.size else 0.0
    verdict, headline = _verdict(profitable, median_sharpe, median_trades, real_return, rank, r.size)

    return {
        "verdict": verdict,
        "headline": headline,
        "paths": int(r.size),
        "block": block,
        "real": {"total_return": round(real_return, 4), "sharpe_ratio": round(real_sharpe, 4)},
        "profitable_share": round(profitable, 4),
        "real_rank": round(rank, 4),
        "median_trades": median_trades,
        "returns": _pcts(r),
        "sharpes": _pcts(s),
        "hold_median": round(float(np.median(holds)), 4) if holds else 0.0,
        "histogram": _histogram(r),
    }


def _verdict(
    profitable: float,
    median_sharpe: float,
    median_trades: float,
    real_return: float,
    rank: float,
    count: int,
) -> tuple[str, str]:
    if count < 10 or median_trades < 3:
        return "thin", "Most alternate histories produce fewer than three trades, so they cannot judge the rules."
    share = f"{profitable * 100:.0f}%"
    if profitable >= 0.7 and median_sharpe > 0:
        return "robust", f"The rules made money on {share} of alternate histories, not only on the one that happened."
    if real_return > 0 and profitable < 0.4:
        return (
            "history_only",
            f"Only {share} of alternate histories pay, yet the real one did (better than {rank * 100:.0f}% of them). "
            "The profit leans on that one specific sequence of bars.",
        )
    if profitable >= 0.4:
        return "fragile", f"{share} of alternate histories make money. The edge is a coin flip across histories."
    return "no_edge", f"Only {share} of alternate histories make money, and the real one did not either."
