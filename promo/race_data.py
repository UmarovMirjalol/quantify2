"""Equity curves for the "$10,000 race" teaser, computed with the Quantify engine on 10 years of daily bars.

    python promo/race_data.py SPY     # -> promo/race_SPY.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "backend" / "scripts"))

from app.backtesting.engine import BacktestEngine  # noqa: E402
from app.data.market_fetcher import fetch_market_frame  # noqa: E402
from app.research.discovery import _spec, _templates  # noqa: E402
from survival_study import COMMISSION, SLIPPAGE, _hold_template  # noqa: E402

START = 10_000
RULES = ["RSI(14) 30/70", "Bollinger 20, 2σ bounce", "Donchian 20/10", "SMA 50 × 200", "MACD × signal"]


def curve(template: dict, ticker: str, frame) -> dict:
    res = BacktestEngine(_spec(template, ticker, COMMISSION, SLIPPAGE)).run(frame)
    eq = [float(p["equity"]) for p in res["equity_curve"]]
    scale = START / eq[0]
    return {"label": template["label"], "trades": int(res["metrics"].get("number_of_trades") or 0),
            "equity": [round(v * scale, 2) for v in eq]}


def main() -> None:
    ticker = sys.argv[1] if len(sys.argv) > 1 else "SPY"
    df, _ = fetch_market_frame(ticker, history="10y")
    df = df.reset_index(drop=True)
    by_label = {t["label"]: t for t in _templates()}
    lines = [curve(_hold_template(), ticker, df)] + [curve(by_label[r], ticker, df) for r in RULES]
    out = Path(__file__).resolve().parent / f"race_{ticker}.json"
    out.write_text(json.dumps({"ticker": ticker, "dates": [str(d)[:10] for d in df["date"]], "lines": lines}))
    for ln in lines:
        print(f"{ln['label']:26} ${ln['equity'][-1]:>10,.0f}  trades {ln['trades']}")
    print(df["date"].iloc[0], "→", df["date"].iloc[-1], len(df))


if __name__ == "__main__":
    main()
