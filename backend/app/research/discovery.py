"""Strategy discovery: try a library of classic rule sets without peeking at the test data.

Every template is ranked only on the first 70% of bars. The ranking never looks
at the last 30%; those bars are used once, to report how each pick held up. The
best training Sharpe is also deflated for the number of templates tried, since
the top of many tries is inflated by luck alone.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from app.backtesting.engine import BacktestEngine, BacktestError
from app.llm.schemas import StrategySpec
from app.research.robustness import deflated_sharpe

TRAIN_FRACTION = 0.70
MIN_BARS = 250
MIN_TRADES = 3
TOP = 12

CLOSE = {"indicator": "PRICE", "component": "close"}


def _ind(name: str, **kw: Any) -> dict[str, Any]:
    return {"indicator": name, **kw}


def _cond(left: dict[str, Any], op: str, right: Any) -> dict[str, Any]:
    return {"left": left, "operator": op, "right": right}


def _cross(kind: str, fast: int, slow: int) -> tuple[list, list]:
    f, s = _ind(kind, period=fast), _ind(kind, period=slow)
    return [_cond(f, "cross_above", s)], [_cond(f, "cross_below", s)]


def _templates() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    def add(family: str, label: str, text: str, entry: list, exit_: list) -> None:
        out.append({"family": family, "label": label, "text": text, "entry": entry, "exit": exit_})

    for fast, slow in [(5, 20), (10, 30), (20, 50), (20, 100), (50, 200)]:
        e, x = _cross("SMA", fast, slow)
        add("Trend", f"SMA {fast} × {slow}", f"Buy when SMA {fast} crosses above SMA {slow}, sell when it crosses below.", e, x)
    for fast, slow in [(9, 21), (12, 26), (20, 50), (50, 200)]:
        e, x = _cross("EMA", fast, slow)
        add("Trend", f"EMA {fast} × {slow}", f"Buy when EMA {fast} crosses above EMA {slow}, sell when it crosses below.", e, x)
    for p in (100, 200):
        sma = _ind("SMA", period=p)
        add("Trend", f"Close vs SMA {p}", f"Hold while the close is above the {p}-day SMA.",
            [_cond(CLOSE, "greater_than", sma)], [_cond(CLOSE, "less_than", sma)])
    ema = _ind("EMA", period=50)
    add("Trend", "Close vs EMA 50", "Hold while the close is above the 50-day EMA.",
        [_cond(CLOSE, "greater_than", ema)], [_cond(CLOSE, "less_than", ema)])

    macd, signal = _ind("MACD", component="macd"), _ind("MACD", component="signal")
    add("Momentum", "MACD × signal", "Buy when MACD crosses above its signal line, sell on the reverse cross.",
        [_cond(macd, "cross_above", signal)], [_cond(macd, "cross_below", signal)])
    plus, minus = _ind("ADX", period=14, component="plus"), _ind("ADX", period=14, component="minus")
    add("Momentum", "+DI × −DI", "Buy when +DI crosses above −DI, sell on the reverse cross.",
        [_cond(plus, "cross_above", minus)], [_cond(plus, "cross_below", minus)])
    e, x = _cross("SMA", 20, 50)
    add("Momentum", "SMA 20 × 50 + ADX > 25", "SMA 20 × 50 crossover, entries only when ADX(14) is above 25.",
        e + [_cond(_ind("ADX", period=14), "greater_than", 25.0)], x)

    rsi_m = _ind("RSI", period=14)
    add("Momentum", "RSI(14) momentum 55/45", "Buy when RSI(14) rises above 55, sell when it falls below 45.",
        [_cond(rsi_m, "greater_than", 55.0)], [_cond(rsi_m, "less_than", 45.0)])
    add("Breakout", "Bollinger 20, 2σ breakout", "Buy a close above the upper 20-day Bollinger band, sell below the middle band.",
        [_cond(CLOSE, "greater_than", _ind("BOLLINGER", period=20, std_dev=2.0, component="upper"))],
        [_cond(CLOSE, "less_than", _ind("BOLLINGER", period=20, std_dev=2.0, component="middle"))])

    for entry_n, exit_n in [(10, 5), (20, 10), (55, 20), (100, 50)]:
        add("Breakout", f"Donchian {entry_n}/{exit_n}",
            f"Buy a close above the prior {entry_n}-day high, sell a close below the prior {exit_n}-day low.",
            [_cond(CLOSE, "greater_than", _ind("DONCHIAN", period=entry_n))],
            [_cond(CLOSE, "less_than", _ind("DONCHIAN", period=exit_n, component="lower"))])

    for period, lo, hi in [(14, 30, 70), (14, 40, 60), (2, 10, 70), (7, 25, 65)]:
        rsi = _ind("RSI", period=period)
        add("Mean reversion", f"RSI({period}) {lo}/{hi}", f"Buy when RSI({period}) drops below {lo}, sell above {hi}.",
            [_cond(rsi, "less_than", float(lo))], [_cond(rsi, "greater_than", float(hi))])
    rsi = _ind("RSI", period=14)
    add("Mean reversion", "RSI(14) < 35 above SMA 200", "Buy RSI(14) dips below 35 only while above the 200-day SMA; sell above 65.",
        [_cond(rsi, "less_than", 35.0), _cond(CLOSE, "greater_than", _ind("SMA", period=200))],
        [_cond(rsi, "greater_than", 65.0)])
    for std in (2.0, 2.5):
        add("Mean reversion", f"Bollinger 20, {std:g}σ bounce",
            f"Buy a close below the lower 20-day Bollinger band ({std:g}σ), sell back at the middle band.",
            [_cond(CLOSE, "less_than", _ind("BOLLINGER", period=20, std_dev=std, component="lower"))],
            [_cond(CLOSE, "greater_than", _ind("BOLLINGER", period=20, std_dev=std, component="middle"))])
    k, d = _ind("STOCH", period=14, signal_period=3), _ind("STOCH", period=14, signal_period=3, component="d")
    add("Mean reversion", "Stochastic 20/80", "Buy when %K(14,3) drops below 20, sell above 80.",
        [_cond(k, "less_than", 20.0)], [_cond(k, "greater_than", 80.0)])
    add("Mean reversion", "Stochastic %K × %D oversold", "Buy %K crossing above %D below 20, sell %K crossing below %D.",
        [_cond(k, "cross_above", d), _cond(k, "less_than", 20.0)], [_cond(k, "cross_below", d)])
    return out


def _spec(t: dict[str, Any], asset: str, commission: float, slippage: float) -> StrategySpec:
    return StrategySpec.model_validate(
        {
            "asset": asset or "ASSET",
            "initial_capital": 100_000,
            "commission": commission,
            "slippage": slippage,
            "position_sizing": "percent_capital",
            "risk": {"percent_capital": 1.0},
            "entry_conditions": t["entry"],
            "exit_conditions": t["exit"],
        }
    )


def _score(spec: StrategySpec, frame: pd.DataFrame, equity: bool = False) -> dict[str, Any] | None:
    try:
        res = BacktestEngine(spec).run(frame.reset_index(drop=True), metrics_only=not equity)
    except (BacktestError, ValueError):
        return None
    m = res["metrics"]
    out = {
        "sharpe_ratio": m.get("sharpe_ratio"),
        "total_return": m.get("total_return"),
        "max_drawdown": m.get("max_drawdown"),
        "trades": int(m.get("number_of_trades") or 0),
    }
    if equity:
        out["equity"] = [float(pt["equity"]) for pt in res["equity_curve"]]
    return out


def _hold(frame: pd.DataFrame) -> float:
    c = pd.to_numeric(frame["close"], errors="coerce")
    return float(c.iloc[-1] / c.iloc[0] - 1.0)


def run_discovery(
    data: pd.DataFrame,
    *,
    asset: str = "",
    commission: float = 0.001,
    slippage: float = 0.0005,
) -> dict[str, Any]:
    df = data.reset_index(drop=True)
    n = len(df)
    if n < MIN_BARS:
        raise ValueError(f"Need at least {MIN_BARS} bars to search without peeking.")
    cut = int(n * TRAIN_FRACTION)
    train, test = df.iloc[:cut], df.iloc[cut:]

    scored = []
    for t in _templates():
        spec = _spec(t, asset, commission, slippage)
        tr = _score(spec, train)
        if tr is None or tr["sharpe_ratio"] is None or tr["trades"] < MIN_TRADES:
            continue
        scored.append({**t, "spec": spec, "train": tr})
    tried = len(_templates())
    scored.sort(key=lambda c: float(c["train"]["sharpe_ratio"]), reverse=True)

    split = {
        "train_bars": cut,
        "test_bars": n - cut,
        "train_start": str(df["date"].iloc[0])[:10],
        "train_end": str(df["date"].iloc[cut - 1])[:10],
        "test_start": str(df["date"].iloc[cut])[:10],
        "test_end": str(df["date"].iloc[-1])[:10],
        "train_hold": round(_hold(train), 4),
        "test_hold": round(_hold(test), 4),
    }
    if not scored:
        return {
            "tried": tried, "eligible": 0, "split": split, "candidates": [], "deflated": None,
            "verdict": "thin", "headline": f"None of the {tried} templates traded at least {MIN_TRADES} times in training.",
        }

    candidates = []
    for c in scored[:TOP]:
        te = _score(c["spec"], test)
        passes = bool(
            te is not None
            and float(c["train"]["sharpe_ratio"]) > 0
            and te["sharpe_ratio"] is not None
            and float(te["sharpe_ratio"]) > 0
            and (te["total_return"] or 0) > 0
            and te["trades"] >= 2
        )
        candidates.append(
            {
                "family": c["family"],
                "label": c["label"],
                "text": c["text"],
                "train": c["train"],
                "test": te,
                "passes": passes,
                "beats_hold_test": bool(te and (te["total_return"] or 0) > split["test_hold"]),
                "strategy": c["spec"].model_dump(mode="json"),
            }
        )

    best_train = _score(scored[0]["spec"], train, equity=True)
    deflated = None
    if best_train and len(best_train["equity"]) > 2:
        d = deflated_sharpe(best_train["equity"], [float(c["train"]["sharpe_ratio"]) for c in scored])
        deflated = {
            "verdict": d["verdict"],
            "probability": d["probability"],
            "expected_max_sharpe": d["expected_max_sharpe"],
        }

    passed = sum(1 for c in candidates if c["passes"])
    luck = deflated is not None and deflated["verdict"] == "luck"
    if passed == 0:
        verdict, headline = "none", (
            f"Tried {tried} classic rule sets. None of the top {len(candidates)} by training Sharpe stayed profitable "
            "on the unseen 30%. On this asset, these templates do not show a durable edge."
        )
    elif candidates[0]["passes"] and not luck:
        verdict, headline = "found", (
            f"{candidates[0]['label']} led training and stayed profitable on the unseen 30%, "
            f"and the lead survives the {tried}-try luck adjustment. {passed} of the top {len(candidates)} passed."
        )
    else:
        verdict, headline = "mixed", (
            f"{passed} of the top {len(candidates)} stayed profitable on unseen bars, but "
            + ("the training leader is within what luck alone would produce." if luck else "the training leader did not hold up.")
            + " Treat these as ideas to test further, not finished strategies."
        )
    return {
        "tried": tried,
        "eligible": len(scored),
        "split": split,
        "candidates": candidates,
        "deflated": deflated,
        "verdict": verdict,
        "headline": headline,
    }
