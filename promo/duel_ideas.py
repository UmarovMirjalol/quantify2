"""Quick numbers for "two people, two habits" duel ideas on 10 years of daily closes.

    python promo/duel_ideas.py SPY
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.data.market_fetcher import fetch_market_frame  # noqa: E402

MONTHLY = 100


def main() -> None:
    ticker = sys.argv[1] if len(sys.argv) > 1 else "SPY"
    df, _ = fetch_market_frame(ticker, history="10y")
    px = pd.Series(df["close"].to_numpy(dtype=float), index=pd.to_datetime(df["date"]))
    last = px.iloc[-1]
    print(ticker, px.index[0].date(), "→", px.index[-1].date())

    months = px.groupby(px.index.to_period("M"))
    first_days = months.head(1)
    paid = MONTHLY * len(first_days)
    dca = sum(MONTHLY / p for p in first_days) * last
    print(f"\n[1] Every month ${MONTHLY}: paid ${paid:,.0f} -> ${dca:,.0f}")

    cash, units = 0.0, 0.0
    peak = px.iloc[0]
    month_seen = set()
    for d, p in px.items():
        m = d.to_period("M")
        if m not in month_seen:
            month_seen.add(m)
            cash += MONTHLY
        peak = max(peak, p)
        if p <= peak * 0.9 and cash > 0:
            units += cash / p
            cash = 0.0
    wait = units * last + cash
    print(f"    Waits for a 10% dip: -> ${wait:,.0f} (still holding ${cash:,.0f} cash)")

    years = px.groupby(px.index.year)
    full = [y for y, s in years if len(s) > 200]
    worst = sum(1000 / s.max() for y, s in years if y in full) * last
    best = sum(1000 / s.min() for y, s in years if y in full) * last
    print(f"\n[2] $1,000 a year, {len(full)} years: worst day each year -> ${worst:,.0f}; perfect day -> ${best:,.0f}; "
          f"paid ${1000 * len(full):,.0f}")

    ret = px.pct_change().dropna()
    hold = 10_000 * (1 + ret).prod()
    miss10 = 10_000 * (1 + ret.drop(ret.nlargest(10).index)).prod()
    miss20 = 10_000 * (1 + ret.drop(ret.nlargest(20).index)).prod()
    print(f"\n[3] $10,000 held: ${hold:,.0f}; missed 10 best days: ${miss10:,.0f}; missed 20: ${miss20:,.0f}")
    print("    best days:", [d.date().isoformat() for d in ret.nlargest(10).index])

    sma = px.rolling(200).mean()
    invested = (px > sma).shift(1, fill_value=False)
    scared = 10_000 * (1 + ret.where(invested.loc[ret.index], 0.0)).prod()
    switches = int(invested.astype(int).diff().abs().sum())
    print(f"\n[4] Sells when the market 'looks scary' (below 200-day avg): ${scared:,.0f}, {switches} switches")

    lump = 10_000 * last / px.iloc[0]
    print(f"\n[5] Started 2016 with $10,000: ${lump:,.0f}")
    for y in (2019, 2021):
        start = px[px.index.year == y].iloc[0]
        print(f"    Started {y}: ${10_000 * last / start:,.0f}")


if __name__ == "__main__":
    main()
