"""Vertical 9:16 duel teaser: "Unlucky Brian" buys $1,000 on the most expensive day of every year,
"Lucky Larry" on the cheapest. Real daily closes, 10 years.

    python promo/duel_teaser.py SPY      # -> promo/duel_unlucky_SPY.mp4
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.patches import Ellipse

import race_teaser as race
import research_teaser as rt
from race_teaser import txt
from research_teaser import ACCENT, BG, MONO, MUTED, NEG, SERIF, TEXT, H, W, appear, ease

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.data.market_fetcher import fetch_market_frame  # noqa: E402

HERE = Path(__file__).resolve().parent
YEARLY = 1000
BRIAN, LARRY, NEVER = NEG, ACCENT, "#98a2ac"

SCRIPT = [
    ("hook", 3.5, [("hook", "This guy had the worst luck in the history of investing.")]),
    ("players", 4.5, [("brian", "Every year, Brian put in one thousand dollars, always on the most expensive day of the year."),
                      ("larry", "His friend Larry did the same, but always on the cheapest day.")]),
    ("race", 12.0, [("go", "Ten years. Same money. Let's see."),
                    ("watch", "Red dots are Brian's buys. Right at the top.")]),
    ("results", 5.0, [("larry_end", "Lucky Larry ended with twenty three thousand."),
                      ("brian_end", "And unlucky Brian? Almost eighteen thousand. Still up almost eighty percent.")]),
    ("lesson", 4.5, [("lesson", "Even the worst timing in the world beat never starting.")]),
    ("outro", 4.0, [("thesis", "Time in the market beats timing the market."),
                    ("brand", "Test any idea on ten years of real data, for free. Link in bio.")]),
]
MIN_BEAT = {"watch": 5.5}


def simulate(ticker: str):
    df, _ = fetch_market_frame(ticker, history="10y")
    px = pd.Series(df["close"].to_numpy(dtype=float), index=pd.to_datetime(df["date"]))
    years = [y for y, s in px.groupby(px.index.year) if len(s) > 200]
    px = px[px.index.year >= years[0]]
    buys = {"brian": [], "larry": []}
    for y in years:
        s = px[px.index.year == y]
        buys["brian"].append(s.idxmax())
        buys["larry"].append(s.idxmin())
    out = {"px": px, "years": years, "buys": buys}
    for who, dates in buys.items():
        units = pd.Series(0.0, index=px.index)
        paid = pd.Series(0.0, index=px.index)
        for d in dates:
            units[d] += YEARLY / px[d]
            paid[d] += YEARLY
        out[who] = (units.cumsum() * px).to_numpy()
        out[f"{who}_paid"] = paid.cumsum().to_numpy()
    print(f"{ticker} {years[0]}-{years[-1]}: Brian ${out['brian'][-1]:,.0f}, Larry ${out['larry'][-1]:,.0f}, "
          f"paid ${out['brian_paid'][-1]:,.0f}")
    return out


class Duel:
    def __init__(self, ticker: str, sim):
        self.ticker, self.s = ticker, sim
        self.n = len(sim["px"])
        self.idx = {who: [sim["px"].index.get_loc(d) for d in sim["buys"][who]] for who in ("brian", "larry")}

    def brand(self, fig, a):
        txt(fig, 0.47, 0.875, f"QUANTIFY  ·  BAD LUCK TEST  ·  {self.ticker}", 15, ACCENT, a * 0.9, MONO)

    def circle(self, fig, x, y, r, color, letter, a):
        fig.patches.append(Ellipse((x, y), 2 * r, 2 * r * W / H, transform=fig.transFigure, color=color, alpha=a))
        txt(fig, x, y, letter, int(r * 1500), BG, a, weight="bold")

    def hook(self, fig, tl, a, b, dur):
        self.brand(fig, a)
        self.circle(fig, 0.47, 0.64, 0.11, BRIAN, "B", a)
        txt(fig, 0.47, 0.52, "Unlucky Brian", 56, BRIAN, a, weight="bold")
        r = appear(tl, 0.8, a)
        txt(fig, 0.47, 0.44, "bought on the WORST day", 40, TEXT, r)
        txt(fig, 0.47, 0.4, "of the year. Every year.", 40, TEXT, r)

    def players(self, fig, tl, a, b, dur):
        self.brand(fig, a)
        for key, y, color, letter, name, line1, line2 in (
            ("brian", 0.68, BRIAN, "B", "Unlucky Brian", "$1,000 every year", "on the MOST expensive day"),
            ("larry", 0.45, LARRY, "L", "Lucky Larry", "$1,000 every year", "on the CHEAPEST day"),
        ):
            r = appear(tl, b[key] - 0.1, a)
            self.circle(fig, 0.2, y, 0.07, color, letter, r)
            txt(fig, 0.33, y + 0.035, name, 44, color, r, weight="bold", ha="left")
            txt(fig, 0.33, y - 0.005, line1, 30, TEXT, r, ha="left")
            txt(fig, 0.33, y - 0.04, line2, 30, MUTED, r, ha="left")

    def race(self, fig, tl, a, b, dur):
        self.brand(fig, a)
        k = min(1.0, max(0.0, (tl - 0.4) / (dur - 1.6)))
        i = max(1, int(k * (self.n - 1)))
        px = self.s["px"].to_numpy()
        txt(fig, 0.47, 0.81, str(self.s["px"].index[i].year), 72, TEXT, a, MONO, "bold")
        ax = fig.add_axes((0.12, 0.5, 0.72, 0.26))
        ax.set_facecolor(BG)
        ax.set_xlim(0, self.n - 1)
        ax.set_ylim(px.min() * 0.9, px.max() * 1.08)
        ax.axis("off")
        ax.plot(np.arange(i + 1), px[: i + 1], color=TEXT, lw=2, alpha=0.75 * a)
        for who, color in (("brian", BRIAN), ("larry", LARRY)):
            pts = [j for j in self.idx[who] if j <= i]
            ax.scatter(pts, px[pts], s=170, color=color, alpha=a, zorder=5, edgecolors=BG, linewidths=2)
        txt(fig, 0.3, 0.47, "● Brian buys", 28, BRIAN, a, weight="bold")
        txt(fig, 0.64, 0.47, "● Larry buys", 28, LARRY, a, weight="bold")
        for y, who, color, letter, name in ((0.39, "brian", BRIAN, "B", "Brian"), (0.29, "larry", LARRY, "L", "Larry")):
            self.circle(fig, 0.16, y, 0.03, color, letter, a)
            txt(fig, 0.22, y + 0.01, name, 40, color, a, weight="bold", ha="left")
            txt(fig, 0.22, y - 0.022, f"put in ${self.s[f'{who}_paid'][i]:,.0f}", 24, MUTED, a, MONO, ha="left")
            txt(fig, 0.84, y, f"${self.s[who][i]:,.0f}", 46, TEXT, a, MONO, "bold", ha="right")

    def results(self, fig, tl, a, b, dur):
        self.brand(fig, a)
        paid = self.s["brian_paid"][-1]
        txt(fig, 0.47, 0.79, f"both put in ${paid:,.0f}", 40, MUTED, a)
        for key, y, who, color, name in (("larry_end", 0.65, "larry", LARRY, "Lucky Larry"),
                                         ("brian_end", 0.45, "brian", BRIAN, "Unlucky Brian")):
            r = appear(tl, b[key] - 0.1, a)
            grow = ease((tl - b[key]) / 1.2)
            final = self.s[who][-1]
            txt(fig, 0.47, y + 0.06, name, 42, color, r, weight="bold")
            txt(fig, 0.47, y, f"${final * grow:,.0f}", 100, TEXT, r, MONO, "bold")
            txt(fig, 0.47, y - 0.06, f"+{(final / paid - 1) * 100:.0f}%", 44, color, appear(tl, b[key] + 1.0, a), MONO, "bold")

    def lesson(self, fig, tl, a, b, dur):
        self.brand(fig, a)
        paid = self.s["brian_paid"][-1]
        rows = [("Perfect timing", self.s["larry"][-1] / paid - 1, LARRY),
                ("WORST timing", self.s["brian"][-1] / paid - 1, BRIAN),
                ("Never started", 0.0, NEVER)]
        top = max(r[1] for r in rows)
        for i, (name, gain, color) in enumerate(rows):
            r = appear(tl, 0.2 + i * 0.5, a)
            grow = ease((tl - 0.2 - i * 0.5) / 0.9)
            y = 0.68 - i * 0.13
            txt(fig, 0.12, y + 0.035, name, 38, color, r, weight="bold", ha="left")
            fig.patches.append(plt.Rectangle((0.12, y - 0.02), max(0.006, 0.55 * grow * gain / top), 0.03,
                                             transform=fig.transFigure, color=color, alpha=r * 0.9))
            txt(fig, 0.84, y - 0.005, f"+{gain * 100 * grow:.0f}%", 40, TEXT, r, MONO, "bold", ha="right")
        txt(fig, 0.47, 0.3, "bad timing still beat\nwaiting forever", 40, TEXT, appear(tl, 1.8, a), linespacing=1.2)

    def outro(self, fig, tl, a, b, dur):
        txt(fig, 0.47, 0.7, "Time in the market", 48, TEXT, a, SERIF)
        txt(fig, 0.47, 0.645, "> timing the market", 48, ACCENT, a, SERIF)
        r = appear(tl, b["brand"] - 0.1, a)
        txt(fig, 0.47, 0.52, "Quantify", 84, TEXT, r, SERIF, "bold")
        txt(fig, 0.47, 0.455, "test any idea on 10 years\nof real data", 32, MUTED, r, linespacing=1.2)
        txt(fig, 0.47, 0.37, "quantifylab.xyz", 48, ACCENT, r, MONO, "bold")
        txt(fig, 0.47, 0.325, "free  ·  no signup", 28, MUTED, r, MONO)


def main() -> None:
    ticker = sys.argv[1] if len(sys.argv) > 1 else "SPY"
    duel = Duel(ticker, simulate(ticker))
    out = HERE / f"duel_unlucky_{ticker}.mp4"
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        clips = race.synthesize(tmp, SCRIPT)
        scenes, cues = race.plan(clips, SCRIPT, MIN_BEAT)
        for sc in scenes:
            print(f"{sc['name']:8} {sc['start']:5.1f}s +{sc['dur']:.1f}s")
        silent = tmp / "silent.mp4"
        draw = {"hook": duel.hook, "players": duel.players, "race": duel.race,
                "results": duel.results, "lesson": duel.lesson, "outro": duel.outro}
        total = race.render(scenes, silent, draw)
        rt.mux(silent, cues, total, out)
    print(f"saved {out} ({total:.1f}s)")


if __name__ == "__main__":
    main()
