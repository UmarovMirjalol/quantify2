"""Cross-check the Quantify engine against backtrader, an independent open-source backtester.

Both engines get the same daily bars and the same rules: signal at the close, market
order filled at the next open, the whole account per trade, 0.1% commission and 0.05%
slippage per side. backtrader computes its own indicators; nothing is shared except
the prices. Writes frontend/public/research/verification.json.

    cd backend
    pip install backtrader
    python -m scripts.verify_against_backtrader
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from math import floor
from pathlib import Path

import backtrader as bt
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.backtesting.engine import BacktestEngine  # noqa: E402
from app.data.market_fetcher import fetch_market_frame  # noqa: E402
from app.llm.schemas import StrategySpec  # noqa: E402

OUT = ROOT.parent / "frontend" / "public" / "research" / "verification.json"
CAPITAL = 100_000.0
COMMISSION = 0.001
SLIPPAGE = 0.0005
TICKERS = ["SPY", "AAPL", "GLD", "BTC-USD"]
CLOSE = {"indicator": "PRICE", "component": "close"}


def _cond(left, op, right):
    return {"left": left, "operator": op, "right": right}


def _cross(kind, fast, slow):
    f, s = {"indicator": kind, "period": fast}, {"indicator": kind, "period": slow}
    return [_cond(f, "cross_above", s)], [_cond(f, "cross_below", s)]


def _cases():
    sma200 = {"indicator": "SMA", "period": 200}
    rsi = {"indicator": "RSI", "period": 14}
    macd = {"indicator": "MACD", "component": "macd"}
    signal = {"indicator": "MACD", "component": "signal"}
    return [
        ("SMA 20 × 50 cross", "sma", (20, 50), *_cross("SMA", 20, 50)),
        ("SMA 50 × 200 cross", "sma", (50, 200), *_cross("SMA", 50, 200)),
        ("Close vs SMA 200", "above", (200,), [_cond(CLOSE, "greater_than", sma200)], [_cond(CLOSE, "less_than", sma200)]),
        ("Donchian 20/10 breakout", "donchian", (20, 10),
         [_cond(CLOSE, "greater_than", {"indicator": "DONCHIAN", "period": 20})],
         [_cond(CLOSE, "less_than", {"indicator": "DONCHIAN", "period": 10, "component": "lower"})]),
        ("Donchian 55/20 breakout", "donchian", (55, 20),
         [_cond(CLOSE, "greater_than", {"indicator": "DONCHIAN", "period": 55})],
         [_cond(CLOSE, "less_than", {"indicator": "DONCHIAN", "period": 20, "component": "lower"})]),
        ("EMA 12 × 26 cross", "ema", (12, 26), *_cross("EMA", 12, 26)),
        ("RSI(14) 30/70", "rsi", (14, 30, 70), [_cond(rsi, "less_than", 30.0)], [_cond(rsi, "greater_than", 70.0)]),
        ("MACD × signal", "macd", (),
         [_cond(macd, "cross_above", signal)], [_cond(macd, "cross_below", signal)]),
        ("Bollinger 20, 2σ bounce", "bbands", (20, 2.0),
         [_cond(CLOSE, "less_than", {"indicator": "BOLLINGER", "period": 20, "std_dev": 2.0, "component": "lower"})],
         [_cond(CLOSE, "greater_than", {"indicator": "BOLLINGER", "period": 20, "std_dev": 2.0, "component": "middle"})]),
    ]


def _quantity(cash: float, close: float) -> float:
    fill = close * (1 + SLIPPAGE)
    q = cash / (fill * (1 + COMMISSION))
    return float(int(q)) if q >= 1 else floor(max(q, 0.0) * 1e6) / 1e6


class Rules(bt.Strategy):
    params = (("kind", "sma"), ("args", ()))

    def __init__(self):
        d, a = self.data, self.p.args
        if self.p.kind in ("sma", "ema"):
            ma = bt.ind.SMA if self.p.kind == "sma" else bt.ind.EMA
            self.fast, self.slow = ma(d.close, period=a[0]), ma(d.close, period=a[1])
        elif self.p.kind == "above":
            self.ma = bt.ind.SMA(d.close, period=a[0])
        elif self.p.kind == "donchian":
            self.upper = bt.ind.Highest(d.high(-1), period=a[0])
            self.lower = bt.ind.Lowest(d.low(-1), period=a[1])
        elif self.p.kind == "rsi":
            self.rsi = bt.ind.RSI_Safe(d.close, period=a[0])
        elif self.p.kind == "macd":
            m = bt.ind.MACD(d.close, period_me1=12, period_me2=26, period_signal=9)
            self.fast, self.slow = m.macd, m.signal
        elif self.p.kind == "bbands":
            self.bb = bt.ind.BollingerBands(d.close, period=a[0], devfactor=a[1])
        self.order = None
        self.fills: list[dict] = []

    def _signals(self) -> tuple[bool, bool]:
        c, a = self.data.close[0], self.p.args
        if self.p.kind in ("sma", "ema", "macd"):
            f0, s0, f1, s1 = self.fast[0], self.slow[0], self.fast[-1], self.slow[-1]
            return f1 <= s1 and f0 > s0, f1 >= s1 and f0 < s0
        if self.p.kind == "above":
            return c > self.ma[0], c < self.ma[0]
        if self.p.kind == "donchian":
            return c > self.upper[0], c < self.lower[0]
        if self.p.kind == "bbands":
            return c < self.bb.bot[0], c > self.bb.mid[0]
        return self.rsi[0] < a[1], self.rsi[0] > a[2]

    def notify_order(self, order):
        if order.status == order.Completed:
            self.fills.append({
                "date": bt.num2date(order.executed.dt).date().isoformat(),
                "price": order.executed.price,
                "size": abs(order.executed.size),
                "buy": order.isbuy(),
            })
        if order.status in (order.Completed, order.Canceled, order.Margin, order.Rejected):
            self.order = None

    def next(self):
        if self.order is not None or len(self.data) >= self.data.buflen():
            return
        entry, exit_ = self._signals()
        if not self.position and entry:
            self.order = self.buy(size=_quantity(self.broker.getcash(), self.data.close[0]))
        elif self.position and exit_:
            self.order = self.close()


def _backtrader(df: pd.DataFrame, kind: str, args: tuple) -> dict:
    cerebro = bt.Cerebro(stdstats=False)
    feed = df.set_index(pd.to_datetime(df["date"]).dt.tz_localize(None))[["open", "high", "low", "close", "volume"]]
    cerebro.adddata(bt.feeds.PandasData(dataname=feed))
    cerebro.addstrategy(Rules, kind=kind, args=args)
    cerebro.broker.setcash(CAPITAL)
    cerebro.broker.setcommission(commission=COMMISSION)
    cerebro.broker.set_slippage_perc(SLIPPAGE, slip_open=True, slip_match=True, slip_out=True)
    strat = cerebro.run()[0]
    trades, open_buy = [], None
    for f in strat.fills:
        if f["buy"]:
            open_buy = f
        elif open_buy is not None:
            trades.append({"entry_date": open_buy["date"], "exit_date": f["date"],
                           "entry_price": open_buy["price"], "exit_price": f["price"], "quantity": open_buy["size"]})
            open_buy = None
    return {"trades": trades, "final_equity": cerebro.broker.getvalue()}


def _quantify(df: pd.DataFrame, entry: list, exit_: list) -> dict:
    spec = StrategySpec.model_validate({
        "asset": "X", "initial_capital": CAPITAL, "commission": COMMISSION, "slippage": SLIPPAGE,
        "position_sizing": "percent_capital", "risk": {"percent_capital": 1.0},
        "entry_conditions": entry, "exit_conditions": exit_,
    })
    res = BacktestEngine(spec).run(df.reset_index(drop=True))
    trades = [{"entry_date": str(t["entry_date"])[:10], "exit_date": str(t["exit_date"])[:10],
               "entry_price": float(t["entry_price"]), "exit_price": float(t["exit_price"]),
               "quantity": float(t["quantity"])} for t in res["trades"]]
    return {"trades": trades, "final_equity": float(res["equity_curve"][-1]["equity"])}


def _same(a: dict, b: dict) -> bool:
    return (
        a["entry_date"] == b["entry_date"] and a["exit_date"] == b["exit_date"]
        and abs(a["quantity"] - b["quantity"]) < 1e-9
        and abs(a["entry_price"] / b["entry_price"] - 1) < 1e-9
        and abs(a["exit_price"] / b["exit_price"] - 1) < 1e-9
    )


def main() -> None:
    rows = []
    for ticker in TICKERS:
        df, _ = fetch_market_frame(ticker, history="10y")
        df = df.reset_index(drop=True)
        for name, kind, args, entry, exit_ in _cases():
            q, b = _quantify(df, entry, exit_), _backtrader(df, kind, args)
            matched = sum(1 for x, y in zip(q["trades"], b["trades"]) if _same(x, y))
            first_diff = next((i for i, (x, y) in enumerate(zip(q["trades"], b["trades"])) if not _same(x, y)), None)
            row = {
                "ticker": ticker,
                "strategy": name,
                "bars": len(df),
                "quantify_trades": len(q["trades"]),
                "backtrader_trades": len(b["trades"]),
                "matched_trades": matched,
                "quantify_final": round(q["final_equity"], 2),
                "backtrader_final": round(b["final_equity"], 2),
                "final_diff_pct": round((q["final_equity"] / b["final_equity"] - 1) * 100, 6),
                "first_mismatch": None if first_diff is None else q["trades"][first_diff]["entry_date"],
            }
            rows.append(row)
            print(f"{ticker:8} {name:26} trades {row['quantify_trades']:>3}/{row['backtrader_trades']:<3} "
                  f"matched {matched:>3}  final diff {row['final_diff_pct']:+.6f}%")

    exact = [r for r in rows if r["matched_trades"] == r["quantify_trades"] == r["backtrader_trades"]]
    total_q = sum(r["quantify_trades"] for r in rows)
    total_m = sum(r["matched_trades"] for r in rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated": datetime.now(timezone.utc).date().isoformat(),
        "backtrader_version": bt.__version__,
        "costs": {"commission": COMMISSION, "slippage": SLIPPAGE},
        "summary": {
            "cases": len(rows),
            "identical_cases": len(exact),
            "trades": total_q,
            "matched_trades": total_m,
            "max_final_diff_pct": max(abs(r["final_diff_pct"]) for r in rows),
            "max_final_diff_pct_exact": max((abs(r["final_diff_pct"]) for r in exact), default=None),
        },
        "rows": rows,
    }, indent=1), encoding="utf-8")
    print(f"\n{len(exact)}/{len(rows)} identical, {total_m}/{total_q} trades matched -> {OUT}")


if __name__ == "__main__":
    main()
