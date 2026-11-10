"""Study: how many classic trading rules that win in a backtest keep winning afterwards?

For every asset, 30 classic rule sets are backtested on the first 70% of up to ten
years of daily bars (in-sample) and then, unchanged, on the last 30% (out-of-sample).
Same costs as the app: 0.1% commission and 0.05% slippage per side, whole account per
trade, signal at the close, fill at the next open. Writes frontend/public/research/survival.json.

    cd backend
    python -m scripts.survival_study
"""

from __future__ import annotations

import json
import statistics
import sys
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.data.market_fetcher import fetch_market_frame  # noqa: E402
from app.research.discovery import MIN_TRADES, TRAIN_FRACTION, _score, _spec, _templates  # noqa: E402
from app.research.robustness import deflated_sharpe  # noqa: E402
from app.research.screener import UNIVERSES  # noqa: E402

OUT = ROOT.parent / "frontend" / "public" / "research" / "survival.json"
COMMISSION, SLIPPAGE = 0.001, 0.0005
MIN_BARS = 750

EXTRA = {
    "Stock": ["MCD", "NKE", "DIS", "BA", "CAT", "GE", "F", "GM", "T", "VZ", "PFE", "MRK", "CVX", "IBM",
              "QCOM", "TXN", "GS", "MS", "C", "WFC", "SBUX", "LOW", "UPS", "MMM", "HON", "AMGN"],
    "ETF": ["EWJ", "EWZ", "FXI", "EWG", "INDA", "XLB", "SMH", "ARKK"],
    "FX": ["EURUSD=X", "GBPUSD=X", "JPY=X", "AUDUSD=X"],
    "Futures": ["GC=F", "SI=F", "ZC=F", "NG=F"],
}
CLASS_OF_UNIVERSE = {"us_megacaps": "Stock", "etfs": "ETF", "crypto": "Crypto"}


def _universe() -> list[tuple[str, str]]:
    seen: dict[str, str] = {}
    for key, cls in CLASS_OF_UNIVERSE.items():
        for t in UNIVERSES[key]["tickers"]:
            seen.setdefault(t, cls)
    for cls, tickers in EXTRA.items():
        for t in tickers:
            seen.setdefault(t, cls)
    return list(seen.items())


def _hold_template() -> dict:
    close = {"indicator": "PRICE", "component": "close"}
    return {"family": "Benchmark", "label": "Buy & hold",
            "entry": [{"left": close, "operator": "greater_than", "right": 0.0}],
            "exit": [{"left": close, "operator": "less_than", "right": 0.0}]}


def _fetch(item: tuple[str, str]) -> tuple[str, str, pd.DataFrame | None]:
    ticker, cls = item
    try:
        df, _ = fetch_market_frame(ticker, history="10y")
        return ticker, cls, df.reset_index(drop=True)
    except Exception as exc:  # noqa: BLE001
        print(f"skip {ticker}: {exc}")
        return ticker, cls, None


def _r(x, nd=4):
    return None if x is None or not np.isfinite(x) else round(float(x), nd)


def _study_one(args: tuple[str, str, pd.DataFrame]) -> dict | None:
    ticker, cls, df = args
    n = len(df)
    if n < MIN_BARS:
        return None
    cut = int(n * TRAIN_FRACTION)
    train, test = df.iloc[:cut], df.iloc[cut:]
    hold_spec = _spec(_hold_template(), ticker, COMMISSION, SLIPPAGE)
    hold_train, hold_test = _score(hold_spec, train), _score(hold_spec, test)

    rows = []
    for t in _templates():
        spec = _spec(t, ticker, COMMISSION, SLIPPAGE)
        tr, te = _score(spec, train), _score(spec, test)
        if tr is None or te is None:
            continue
        rows.append({
            "label": t["label"], "family": t["family"],
            "train_sharpe": _r(tr["sharpe_ratio"], 3), "train_return": _r(tr["total_return"]), "train_trades": tr["trades"],
            "test_sharpe": _r(te["sharpe_ratio"], 3), "test_return": _r(te["total_return"]), "test_trades": te["trades"],
        })

    eligible = [r for r in rows if r["train_sharpe"] is not None and r["train_trades"] >= MIN_TRADES]
    best = max(eligible, key=lambda r: r["train_sharpe"]) if eligible else None
    luck = None
    if best is not None:
        t = next(x for x in _templates() if x["label"] == best["label"])
        eq = _score(_spec(t, ticker, COMMISSION, SLIPPAGE), train, equity=True)
        if eq and len(eq["equity"]) > 2:
            luck = deflated_sharpe(eq["equity"], [r["train_sharpe"] for r in eligible])["verdict"] == "luck"
    return {
        "ticker": "TON-USD" if ticker.startswith("TON") else ticker,
        "class": cls,
        "bars": n,
        "start": str(df["date"].iloc[0])[:10],
        "split": str(df["date"].iloc[cut])[:10],
        "end": str(df["date"].iloc[-1])[:10],
        "hold": {
            "train_sharpe": _r(hold_train and hold_train["sharpe_ratio"], 3),
            "train_return": _r(hold_train and hold_train["total_return"]),
            "test_sharpe": _r(hold_test and hold_test["sharpe_ratio"], 3),
            "test_return": _r(hold_test and hold_test["total_return"]),
        },
        "best": best["label"] if best else None,
        "best_luck": luck,
        "rules": rows,
    }


def _passes(r: dict) -> bool:
    return (r["train_sharpe"] or 0) > 0 and (r["test_sharpe"] or 0) > 0 and (r["test_return"] or 0) > 0 and r["test_trades"] >= 2


def _share(xs: list[bool]) -> float | None:
    return round(sum(xs) / len(xs), 4) if xs else None


def _median(xs: list[float]) -> float | None:
    xs = [x for x in xs if x is not None]
    return round(statistics.median(xs), 3) if xs else None


def _spearman(a: list[float], b: list[float]) -> float | None:
    if len(a) < 5:
        return None
    ra, rb = pd.Series(a).rank(), pd.Series(b).rank()
    c = ra.corr(rb)
    return None if pd.isna(c) else float(c)


def _summarize(assets: list[dict]) -> dict:
    pairs = [(a, r) for a in assets for r in a["rules"]
             if r["train_sharpe"] is not None and r["test_sharpe"] is not None and r["train_trades"] >= MIN_TRADES]
    winners = [(a, r) for a, r in pairs if r["train_sharpe"] > 0]
    losers = [(a, r) for a, r in pairs if r["train_sharpe"] <= 0]

    def beats_hold(a, r):
        h = a["hold"]["test_return"]
        return h is not None and (r["test_return"] or 0) > h

    best = [(a, next(r for r in a["rules"] if r["label"] == a["best"])) for a in assets if a["best"]]
    rhos = [_spearman([r["train_sharpe"] for _, r in g], [r["test_sharpe"] for _, r in g])
            for g in ([(a, r) for a2, r in pairs if a2 is a] for a in assets)]
    rhos = [x for x in rhos if x is not None]

    ordered = sorted(pairs, key=lambda p: p[1]["train_sharpe"])
    q = len(ordered) // 5
    bottom, top = ordered[:q], ordered[-q:] if q else []

    def group(key):
        out = {}
        for name in sorted({key(a, r) for a, r in pairs}):
            g = [(a, r) for a, r in pairs if key(a, r) == name]
            w = [(a, r) for a, r in g if r["train_sharpe"] > 0]
            out[name] = {
                "pairs": len(g),
                "train_winners": len(w),
                "survival": _share([_passes(r) for _, r in w]),
                "beat_hold": _share([_passes(r) and beats_hold(a, r) for a, r in w]),
                "median_train_sharpe": _median([r["train_sharpe"] for _, r in w]),
                "median_test_sharpe": _median([r["test_sharpe"] for _, r in w]),
            }
        return out

    return {
        "assets": len(assets),
        "rules_per_asset": len(_templates()),
        "pairs": len(pairs),
        "train_winners": len(winners),
        "winner_survival": _share([_passes(r) for _, r in winners]),
        "winner_beat_hold": _share([_passes(r) and beats_hold(a, r) for a, r in winners]),
        "loser_positive_test": _share([(r["test_sharpe"] or 0) > 0 and (r["test_return"] or 0) > 0 for _, r in losers]),
        "winner_positive_test": _share([(r["test_sharpe"] or 0) > 0 and (r["test_return"] or 0) > 0 for _, r in winners]),
        "best_pick": {
            "count": len(best),
            "survival": _share([_passes(r) for _, r in best]),
            "beat_hold_return": _share([beats_hold(a, r) for a, r in best]),
            "beat_hold_sharpe": _share([(r["test_sharpe"] or 0) > (a["hold"]["test_sharpe"] or 0) for a, r in best]),
            "median_train_sharpe": _median([r["train_sharpe"] for _, r in best]),
            "median_test_sharpe": _median([r["test_sharpe"] for _, r in best]),
            "median_hold_test_sharpe": _median([a["hold"]["test_sharpe"] for a, _ in best]),
            "flagged_luck": _share([bool(a["best_luck"]) for a, _ in best if a["best_luck"] is not None]),
        },
        "rank_correlation": {
            "median": _median(rhos),
            "positive_share": _share([x > 0 for x in rhos]),
            "assets": len(rhos),
        },
        "quintiles": {
            "top_train_sharpe": _median([r["train_sharpe"] for _, r in top]),
            "top_test_sharpe": _median([r["test_sharpe"] for _, r in top]),
            "bottom_train_sharpe": _median([r["train_sharpe"] for _, r in bottom]),
            "bottom_test_sharpe": _median([r["test_sharpe"] for _, r in bottom]),
        },
        "by_family": group(lambda a, r: r["family"]),
        "by_class": group(lambda a, r: a["class"]),
        "by_rule": group(lambda a, r: r["label"]),
    }


def main() -> None:
    universe = _universe()
    print(f"fetching {len(universe)} assets…")
    with ThreadPoolExecutor(max_workers=8) as pool:
        fetched = [x for x in pool.map(_fetch, universe) if x[2] is not None]
    print(f"backtesting {len(fetched)} assets × {len(_templates())} rules…")
    with ProcessPoolExecutor() as pool:
        assets = [a for a in pool.map(_study_one, fetched) if a is not None]
    assets.sort(key=lambda a: (a["class"], a["ticker"]))
    summary = _summarize(assets)
    rules = [{"label": t["label"], "family": t["family"]} for t in _templates()]
    position = {r["label"]: i for i, r in enumerate(rules)}
    for a in assets:
        a["rules"] = [[position[r["label"]], r["train_sharpe"], r["train_return"], r["train_trades"],
                       r["test_sharpe"], r["test_return"], r["test_trades"]] for r in a["rules"]]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated": datetime.now(timezone.utc).date().isoformat(),
        "method": {
            "train_fraction": TRAIN_FRACTION, "min_trades": MIN_TRADES, "history": "up to 10 years of daily bars",
            "commission": COMMISSION, "slippage": SLIPPAGE, "min_bars": MIN_BARS,
        },
        "summary": summary,
        "rule_index": rules,
        "rule_columns": ["rule", "train_sharpe", "train_return", "train_trades", "test_sharpe", "test_return", "test_trades"],
        "assets": assets,
    }, separators=(",", ":")), encoding="utf-8")
    s = summary
    print(json.dumps({k: s[k] for k in ("assets", "pairs", "train_winners", "winner_survival", "winner_beat_hold",
                                          "loser_positive_test", "winner_positive_test", "best_pick",
                                          "rank_correlation", "quintiles")}, indent=1))
    print("families:", json.dumps(s["by_family"], indent=1))
    print("classes:", json.dumps(s["by_class"], indent=1))


if __name__ == "__main__":
    main()
