"""Vertical 9:16 "$10,000 race" teaser: famous strategies vs. just holding, from promo/race_<TICKER>.json.

    python promo/race_data.py SPY
    python promo/race_teaser.py SPY      # -> promo/race_teaser_SPY.mp4
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import imageio.v2 as imageio
import matplotlib.pyplot as plt
import numpy as np

import research_teaser as rt
from research_teaser import ACCENT, BG, DIM, FPS, H, MONO, MUTED, NEG, SANS, SERIF, TEXT, W, appear, ease

HERE = Path(__file__).resolve().parent
LEAD, GAP, TAIL, FADE = 0.3, 0.25, 0.6, 0.4
VOICE = {"voices": ["en-US-AndrewNeural", "en-US-GuyNeural"], "rate": "+8%"}

PLAYERS = [
    ("Buy & hold", "Just hold", "buy once, never touch it", ACCENT),
    ("RSI(14) 30/70", "Buy the dip", "buy after a big drop", "#f472b6"),
    ("Donchian 20/10", "Breakout", "buy when price hits a new high", "#fbbf24"),
    ("SMA 50 × 200", "Golden cross", "the famous moving-average signal", "#60a5fa"),
    ("MACD × signal", "MACD", "the most popular indicator", "#a78bfa"),
]

SCRIPT = [
    ("hook", 3.5, [("hook", "I gave ten thousand dollars to five trading strategies, for ten years.")]),
    ("players", 4.0, [("players", "Four famous strategies, against one that does nothing at all. It just buys and holds.")]),
    ("race", 13.0, [("go", "Here are ten years of the stock market, sped up."),
                    ("watch", "Watch the green line.")]),
    ("results", 4.5, [("result", "Doing nothing turned ten thousand into thirty four thousand."),
                      ("best", "The best strategy? Nineteen thousand.")]),
    ("macd", 4.0, [("macd", "And the most popular indicator traded seventy one times, to make seven hundred dollars.")]),
    ("outro", 4.0, [("thesis", "More trading doesn't mean more money."),
                    ("brand", "Test your strategy for free before you risk real money. Link in bio.")]),
]
MIN_BEAT = {"watch": 7.5}


def txt(fig, x, y, s, size, color=TEXT, alpha=1.0, font=SANS, weight="normal", ha="center", **kw):
    fig.text(x, y, s, fontsize=size, color=color, alpha=max(0.0, min(1.0, alpha)), family=font,
             weight=weight, ha=ha, va="center", **kw)


def money(v: float) -> str:
    return f"${v:,.0f}"


def load(ticker: str):
    data = json.loads((HERE / f"race_{ticker}.json").read_text(encoding="utf-8"))
    by_label = {ln["label"]: ln for ln in data["lines"]}
    players = []
    for label, name, desc, color in PLAYERS:
        ln = by_label[label]
        players.append({"name": name, "desc": desc, "color": color, "trades": ln["trades"],
                        "equity": np.asarray(ln["equity"], dtype=float)})
    return data, players


def synthesize(tmp: Path, script=SCRIPT):
    rt.L = VOICE
    clips = {}
    trim = "silenceremove=start_periods=1:start_threshold=-45dB"
    for _scene, _min, lines in script:
        for key, line in lines:
            mp3, wav = tmp / f"{key}.mp3", tmp / f"{key}.wav"
            rt._tts(line, mp3)
            rt.subprocess.run([rt.FFMPEG, "-y", "-loglevel", "error", "-i", str(mp3), "-af",
                               f"{trim},areverse,{trim},areverse", "-ar", "48000", "-ac", "2", str(wav)], check=True)
            clips[key] = (wav, rt._seconds(wav))
            print(f"voice {key}: {clips[key][1]:.2f}s")
    return clips


def plan(clips, script=SCRIPT, min_beat=MIN_BEAT):
    scenes, cues, t = [], [], 0.0
    for name, minimum, lines in script:
        beats, local = {}, LEAD
        for key, _line in lines:
            local = max(local, min_beat.get(key, 0.0))
            beats[key] = local
            cues.append((clips[key][0], t + local))
            local += clips[key][1] + GAP
        dur = max(minimum, local - GAP + TAIL)
        scenes.append({"name": name, "start": t, "dur": dur, "beats": beats})
        t += dur
    return scenes, cues


class Scenes:
    def __init__(self, data, players):
        self.data, self.players = data, players
        self.n = len(players[0]["equity"])
        self.order = list(players)
        self.years = (data["dates"][0][:4], data["dates"][-1][:4])

    def brand(self, fig, a):
        txt(fig, 0.47, 0.875, f"QUANTIFY  ·  $10,000 TEST  ·  {self.data['ticker']}", 15, ACCENT, a * 0.9, MONO)

    def hook(self, fig, tl, a, b, dur):
        self.brand(fig, a)
        txt(fig, 0.47, 0.6, "$10,000", 150, ACCENT, a, MONO, "bold")
        txt(fig, 0.47, 0.5, f"{self.years[0]} → {self.years[1]}", 44, TEXT, appear(tl, 0.6, a))
        txt(fig, 0.47, 0.43, "S&P 500" if self.data["ticker"] == "SPY" else self.data["ticker"], 36, MUTED,
            appear(tl, 0.9, a), MONO)
        txt(fig, 0.47, 0.33, "who makes the most?", 44, TEXT, appear(tl, 1.6, a), weight="bold")

    def players_(self, fig, tl, a, b, dur):
        self.brand(fig, a)
        txt(fig, 0.47, 0.78, "5 players, $10,000 each", 40, TEXT, a, weight="bold")
        for i, p in enumerate(self.players):
            r = appear(tl, 0.2 + i * 0.45, a)
            y = 0.68 - i * 0.085
            fig.patches.append(plt.Circle((0.13, y), 0.012, transform=fig.transFigure, color=p["color"], alpha=r))
            txt(fig, 0.17, y + 0.012, p["name"], 38, p["color"], r, weight="bold", ha="left")
            txt(fig, 0.17, y - 0.02, p["desc"], 26, MUTED, r, ha="left")

    def race(self, fig, tl, a, b, dur):
        self.brand(fig, a)
        k = min(1.0, max(0.0, (tl - 0.4) / (dur - 1.6)))
        idx = max(1, int(k * (self.n - 1)))
        txt(fig, 0.47, 0.81, self.data["dates"][idx][:4], 72, TEXT, a, MONO, "bold")
        ax = fig.add_axes((0.15, 0.49, 0.7, 0.27))
        ax.set_facecolor(BG)
        top = max(float(p["equity"].max()) for p in self.players) * 1.08
        ax.set_xlim(0, self.n - 1)
        ax.set_ylim(0, top)
        for side in ax.spines.values():
            side.set_visible(False)
        ax.set_xticks([])
        ticks = [v for v in (10_000, 20_000, 30_000, 40_000, 60_000) if v < top]
        ax.set_yticks(ticks, [f"${v // 1000}k" for v in ticks])
        ax.tick_params(colors=MUTED, labelsize=18, length=0)
        for v in ticks:
            ax.axhline(v, color=DIM, lw=0.8, alpha=0.6 * a)
        for p in self.players[::-1]:
            hold = p["name"] == "Just hold"
            ax.plot(np.arange(idx + 1), p["equity"][: idx + 1], color=p["color"], lw=4 if hold else 2.4, alpha=a)
            ax.scatter([idx], [p["equity"][idx]], s=90 if hold else 50, color=p["color"], alpha=a, zorder=5)
        order = self.order
        for i in range(len(order) - 1):
            if order[i + 1]["equity"][idx] > order[i]["equity"][idx] * 1.03:
                order[i], order[i + 1] = order[i + 1], order[i]
        for rank, p in enumerate(order):
            y = 0.42 - rank * 0.05
            txt(fig, 0.12, y, f"{p['name']}", 34, p["color"], a, weight="bold", ha="left")
            txt(fig, 0.84, y, money(p["equity"][idx]), 34, TEXT, a, MONO, "bold", ha="right")

    def results(self, fig, tl, a, b, dur):
        self.brand(fig, a)
        txt(fig, 0.47, 0.79, f"after 10 years", 40, MUTED, a)
        order = sorted(self.players, key=lambda p: -p["equity"][-1])
        top = order[0]["equity"][-1]
        for i, p in enumerate(order):
            r = appear(tl, 0.15 + i * 0.25, a)
            grow = ease((tl - 0.15 - i * 0.25) / 1.0)
            y = 0.69 - i * 0.095
            txt(fig, 0.12, y + 0.025, ("#1  " if i == 0 else "") + p["name"], 34, p["color"], r, weight="bold", ha="left")
            fig.patches.append(plt.Rectangle((0.12, y - 0.025), 0.56 * grow * p["equity"][-1] / top, 0.025,
                                             transform=fig.transFigure, color=p["color"], alpha=r * 0.9))
            txt(fig, 0.84, y - 0.012, money(p["equity"][-1] * grow), 30, TEXT, r, MONO, "bold", ha="right")

    def macd(self, fig, tl, a, b, dur):
        self.brand(fig, a)
        p = next(x for x in self.players if x["name"] == "MACD")
        txt(fig, 0.47, 0.74, "the most popular indicator", 38, MUTED, a)
        txt(fig, 0.47, 0.68, "MACD", 60, p["color"], a, weight="bold")
        k = ease((tl - 0.3) / 2.0)
        txt(fig, 0.47, 0.56, f"{round(p['trades'] * k)}", 160, TEXT, a, MONO, "bold")
        txt(fig, 0.47, 0.475, "trades in 10 years", 38, MUTED, a)
        r = appear(tl, 2.2, a)
        profit = p["equity"][-1] - 10_000
        txt(fig, 0.47, 0.37, f"profit: {'+' if profit >= 0 else '−'}{money(abs(profit))}", 64, NEG, r, MONO, "bold")
        hold = self.players[0]["equity"][-1] - 10_000
        txt(fig, 0.47, 0.31, f"just holding: +{money(hold)}", 34, ACCENT, appear(tl, 2.8, a), MONO)

    def outro(self, fig, tl, a, b, dur):
        txt(fig, 0.47, 0.7, "More trading", 50, TEXT, a, SERIF)
        txt(fig, 0.47, 0.645, "≠ more money", 50, ACCENT, a, SERIF)
        r = appear(tl, b["brand"] - 0.1, a)
        txt(fig, 0.47, 0.52, "Quantify", 84, TEXT, r, SERIF, "bold")
        txt(fig, 0.47, 0.455, "test any strategy free\nbefore you risk money", 32, MUTED, r, linespacing=1.2)
        txt(fig, 0.47, 0.37, "quantifylab.xyz", 48, ACCENT, r, MONO, "bold")
        txt(fig, 0.47, 0.325, "free  ·  no signup", 28, MUTED, r, MONO)


def render(scenes, silent: Path, draw: dict) -> float:
    fig = plt.figure(figsize=(W / 100, H / 100), dpi=100, facecolor=BG)
    total = scenes[-1]["start"] + scenes[-1]["dur"]
    writer = imageio.get_writer(silent, fps=FPS, codec="libx264", quality=8, macro_block_size=8)
    for i in range(int(total * FPS)):
        t = i / FPS
        fig.clf()
        fig.patch.set_facecolor(BG)
        for sc in scenes:
            if sc["start"] <= t < sc["start"] + sc["dur"]:
                tl, dur = t - sc["start"], sc["dur"]
                fade_out = ease((dur - tl) / FADE)
                a = fade_out if sc["start"] == 0 else min(ease(tl / FADE), fade_out)
                draw[sc["name"]](fig, tl, a, sc["beats"], dur)
        fig.canvas.draw()
        writer.append_data(np.asarray(fig.canvas.buffer_rgba())[:, :, :3])
        if i % 150 == 0:
            print(f"frame {t:5.1f}s / {total:.1f}s")
    writer.close()
    return total


def main() -> None:
    ticker = sys.argv[1] if len(sys.argv) > 1 else "SPY"
    data, players = load(ticker)
    out = HERE / f"race_teaser_{ticker}.mp4"
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        clips = synthesize(tmp)
        scenes, cues = plan(clips)
        for sc in scenes:
            print(f"{sc['name']:8} {sc['start']:5.1f}s +{sc['dur']:.1f}s")
        silent = tmp / "silent.mp4"
        sc = Scenes(data, players)
        draw = {"hook": sc.hook, "players": sc.players_, "race": sc.race,
                "results": sc.results, "macd": sc.macd, "outro": sc.outro}
        total = render(scenes, silent, draw)
        rt.mux(silent, cues, total, out)
    print(f"saved {out} ({total:.1f}s)")


if __name__ == "__main__":
    main()
