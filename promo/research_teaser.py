"""Vertical 9:16 teaser for the research study, rendered from the real study data, with voice-over.

    pip install matplotlib imageio imageio-ffmpeg edge-tts
    python promo/research_teaser.py en         # -> promo/research_teaser_en.mp4
    python promo/research_teaser.py ru         # -> promo/research_teaser_ru.mp4

Layout keeps text inside the TikTok / Reels safe zone (top tabs, right-hand buttons, bottom caption).
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

import edge_tts
import imageio.v2 as imageio
import imageio_ffmpeg
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "research" / "survival.json"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

W, H, FPS = 1080, 1920, 30
BG, TEXT, MUTED, DIM = "#0a0c0f", "#eef1f3", "#98a2ac", "#3a424b"
ACCENT, NEG = "#4fd6a0", "#e57a84"
FAMILY = {"Trend": "#5eead4", "Breakout": "#fbbf24", "Momentum": "#a78bfa", "Mean reversion": "#f472b6"}
SANS, SERIF, MONO = "Segoe UI", "Georgia", "Consolas"
FADE = 0.45
LEAD, GAP, TAIL = 0.3, 0.2, 0.55
MIN_BEAT = {"reveal": 3.6}
MIN_SCENE = {"intro": 4.0, "method": 3.5, "cloud": 7.0, "decay": 4.0, "hold": 3.5, "outro": 4.0}

LANGS = {
    "en": {
        "voices": ["en-US-AndrewNeural", "en-US-GuyNeural", "en-US-AriaNeural"],
        "rate": "+8%",
        "thousands": ",",
        "script": [
            ("intro", [("count", "I tested almost three thousand trading strategies.")]),
            ("method", [("step1", "First, I picked the best ones on past data."),
                        ("step2", "Then I tested them on years they had never seen.")]),
            ("cloud", [("line", "If the past predicted the future, every dot would land on this line."),
                       ("reveal", "Instead, a random cloud. The past told us almost nothing.")]),
            ("decay", [("drop", "The best strategy lost two thirds of its power on new data.")]),
            ("hold", [("hold", "And simply buying and holding usually did better."),
                      ("share", "The best strategy won only one time in four.")]),
            ("outro", [("thesis", "Looking good on the past doesn't mean it works."),
                       ("brand", "Test your strategy for free before you risk money. Link in bio.")]),
        ],
        "brand": "QUANTIFY  ·  RESEARCH",
        "intro": ("I tested", "trading strategies", "on {assets} stocks, crypto & more"),
        "step": "Step {n}",
        "step1": "pick the best ones\non past data",
        "step2": "test them on years\nthey never saw",
        "cloud_head": ("If the past predicted the future,", "dots would hit the line"),
        "axes": ("How good it looked (past)", "How it really did (future)"),
        "cloud_reveal": ("A random cloud.", "the past told us almost nothing"),
        "decay": ("The best strategy kept only", "of its power on new data"),
        "hold": ("vs. just buying and holding:", "1 in {n}", "the best strategy\nwon only this often"),
        "outro": ("Looks good on the past", "≠ works in the future", "test any strategy free\nbefore you risk money",
                  "quantifylab.xyz", "free  ·  no signup"),
    },
    "ru": {
        "voices": ["ru-RU-SvetlanaNeural"],
        "rate": "+14%",
        "thousands": " ",
        "script": [
            ("intro", [("count", "Проверено почти три тысячи торговых стратегий.")]),
            ("method", [("step1", "Сначала выбираю лучшие на прошлом."),
                        ("step2", "Потом проверяю их на годах, которых они не видели.")]),
            ("cloud", [("line", "Если бы прошлое предсказывало будущее, точки легли бы на эту линию."),
                       ("reveal", "А легли случайным облаком. Прошлое почти ничего не сказало.")]),
            ("decay", [("drop", "Лучшая стратегия на новых данных потеряла две трети силы.")]),
            ("hold", [("hold", "А просто купить и держать обычно было выгоднее."),
                      ("share", "Лучшая стратегия выиграла лишь в одном случае из четырёх.")]),
            ("outro", [("thesis", "Красиво на прошлом не значит, что сработает."),
                       ("brand", "Проверь свою стратегию бесплатно, прежде чем рисковать деньгами.")]),
        ],
        "brand": "QUANTIFY  ·  ИССЛЕДОВАНИЕ",
        "intro": ("Проверено", "торговых стратегий", "на {assets} акциях, крипте и не только"),
        "step": "Шаг {n}",
        "step1": "выбираю лучшие\nна прошлом",
        "step2": "проверяю на годах,\nкоторых они не видели",
        "cloud_head": ("Если бы прошлое предсказывало будущее,", "точки легли бы на линию"),
        "axes": ("Как выглядело (прошлое)", "Как вышло (будущее)"),
        "cloud_reveal": ("Случайное облако.", "прошлое почти ничего не сказало"),
        "decay": ("У лучшей стратегии осталось", "силы на новых данных"),
        "hold": ("против «купить и держать»:", "1 из {n}", "лишь так часто\nлучшая стратегия выигрывала"),
        "outro": ("Красиво на прошлом", "≠ сработает в будущем", "проверь любую стратегию\nдо того, как рисковать",
                  "quantifylab.xyz", "бесплатно  ·  без регистрации"),
    },
}
L = LANGS["en"]


def ease(x: float) -> float:
    x = min(1.0, max(0.0, x))
    return 1 - (1 - x) ** 3


# ---------- voice ----------

def _tts(text: str, path: Path) -> None:
    last: Exception | None = None
    for voice in L["voices"]:
        for attempt in range(4):
            try:
                asyncio.run(edge_tts.Communicate(text, voice, rate=L["rate"]).save(str(path)))
                return
            except Exception as exc:  # noqa: BLE001
                last = exc
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"TTS failed for: {text}") from last


def _seconds(wav: Path) -> float:
    with wave.open(str(wav)) as w:
        return w.getnframes() / w.getframerate()


def synthesize(tmp: Path) -> dict[str, tuple[Path, float]]:
    clips = {}
    trim = "silenceremove=start_periods=1:start_threshold=-45dB"
    for _scene, lines in L["script"]:
        for key, text in lines:
            mp3, wav = tmp / f"{key}.mp3", tmp / f"{key}.wav"
            _tts(text, mp3)
            subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(mp3),
                            "-af", f"{trim},areverse,{trim},areverse", "-ar", "48000", "-ac", "2", str(wav)],
                           check=True)
            clips[key] = (wav, _seconds(wav))
            print(f"voice {key}: {clips[key][1]:.2f}s")
    return clips


def plan(clips) -> tuple[list[dict], list[tuple[Path, float]]]:
    scenes, cues, t = [], [], 0.0
    for name, lines in L["script"]:
        beats, local = {}, LEAD
        for key, _text in lines:
            local = max(local, MIN_BEAT.get(key, 0.0))
            beats[key] = local
            cues.append((clips[key][0], t + local))
            local += clips[key][1] + GAP
        dur = max(MIN_SCENE[name], local - GAP + TAIL)
        scenes.append({"name": name, "start": t, "dur": dur, "beats": beats})
        t += dur
    return scenes, cues


# ---------- visuals ----------

def load():
    study = json.loads(DATA.read_text(encoding="utf-8"))
    s = study["summary"]
    families = [r["family"] for r in study["rule_index"]]
    pts = []
    for a in study["assets"]:
        for rule, tr_sh, _tr_ret, tr_n, te_sh, _te_ret, _te_n in a["rules"]:
            if tr_sh is None or te_sh is None or (tr_n or 0) < study["method"]["min_trades"]:
                continue
            pts.append((tr_sh, te_sh, FAMILY.get(families[rule], MUTED)))
    rng = np.random.default_rng(7)
    rng.shuffle(pts)
    return s, pts


def text(fig, x, y, s, size, color=TEXT, alpha=1.0, font=SANS, weight="normal", **kw):
    fig.text(x, y, s, fontsize=size, color=color, alpha=max(0.0, min(1.0, alpha)), family=font,
             weight=weight, ha="center", va="center", **kw)


def brand(fig, a):
    text(fig, 0.47, 0.875, L["brand"], 15, ACCENT, a * 0.9, MONO)


def appear(tl, at, a, length=0.6):
    return a * ease((tl - at) / length)


def draw_intro(fig, tl, a, b, s, pts):
    brand(fig, a)
    k = ease((tl - 0.3) / 1.8)
    n = int(round(len(pts) * k / 10) * 10) if k < 1 else len(pts)
    top, bottom, sub = L["intro"]
    text(fig, 0.47, 0.66, top, 46, MUTED, a)
    text(fig, 0.47, 0.55, f"{n:,}".replace(",", L["thousands"]), 150, ACCENT, a, MONO, "bold")
    text(fig, 0.47, 0.44, bottom, 46, TEXT, a)
    text(fig, 0.47, 0.37, sub.format(assets=s["assets"]), 30, MUTED, appear(tl, 2.0, a, 0.8), MONO)


def draw_method(fig, tl, a, b, s, pts):
    brand(fig, a)
    a1, a2 = appear(tl, b["step1"] - 0.1, a), appear(tl, b["step2"] - 0.1, a)
    text(fig, 0.47, 0.66, L["step"].format(n=1), 26, ACCENT, a1, MONO)
    text(fig, 0.47, 0.605, L["step1"], 50, TEXT, a1, linespacing=1.15)
    text(fig, 0.47, 0.48, L["step"].format(n=2), 26, ACCENT, a2, MONO)
    text(fig, 0.47, 0.425, L["step2"], 50, TEXT, a2, linespacing=1.15)


def draw_cloud(fig, tl, a, b, s, pts):
    brand(fig, a)
    head1, head2 = L["cloud_head"]
    text(fig, 0.47, 0.83, head1, 32, TEXT, a)
    text(fig, 0.47, 0.797, head2, 36, ACCENT, a)
    ax = fig.add_axes((0.14, 0.38, 0.72, 0.38))
    ax.set_facecolor(BG)
    lo, hi = -1.5, 2.5
    ax.set_xlim(lo, hi)
    ax.set_ylim(lo, hi)
    for side in ax.spines.values():
        side.set_color(DIM)
    ax.tick_params(colors=MUTED, labelsize=16)
    for v in (-1, 0, 1, 2):
        ax.axhline(v, color=DIM, lw=0.6, alpha=0.5 * a)
        ax.axvline(v, color=DIM, lw=0.6, alpha=0.5 * a)
    ax.plot([lo, hi], [lo, hi], color=TEXT, lw=2.2, ls=(0, (6, 6)), alpha=0.8 * a)
    xlabel, ylabel = L["axes"]
    ax.set_xlabel(xlabel, color=MUTED, fontsize=22, family=SANS, labelpad=12)
    ax.set_ylabel(ylabel, color=MUTED, fontsize=22, family=SANS, labelpad=12)
    span = max(1.5, b["reveal"] - 0.8)
    k = ease((tl - 0.6) / span)
    n = int(len(pts) * k)
    if n:
        x = np.clip([p[0] for p in pts[:n]], lo, hi)
        y = np.clip([p[1] for p in pts[:n]], lo, hi)
        ax.scatter(x, y, s=16, c=[p[2] for p in pts[:n]], alpha=0.55 * a, linewidths=0)
    r = appear(tl, b["reveal"] - 0.1, a)
    reveal, corr = L["cloud_reveal"]
    text(fig, 0.47, 0.295, reveal, 50, NEG, r, weight="bold")
    text(fig, 0.47, 0.25, corr, 30, MUTED, r)


def draw_decay(fig, tl, a, b, s, pts):
    brand(fig, a)
    bp = s["best_pick"]
    head, foot = L["decay"]
    text(fig, 0.47, 0.69, head, 42, TEXT, a)
    kept = bp["median_test_sharpe"] / bp["median_train_sharpe"]
    k = ease((tl - (b["drop"] + 0.3)) / 1.8)
    shown = 1 + (kept - 1) * k
    color = ACCENT if k < 0.5 else NEG
    text(fig, 0.47, 0.56, f"{shown * 100:.0f}%", 190, color, a, MONO, "bold")
    text(fig, 0.47, 0.44, foot, 42, MUTED, appear(tl, b["drop"] + 1.2, a))


def draw_hold(fig, tl, a, b, s, pts):
    brand(fig, a)
    bp = s["best_pick"]
    head, big, foot = L["hold"]
    text(fig, 0.47, 0.69, head, 42, TEXT, a)
    r = appear(tl, b["share"] - 0.1, a)
    text(fig, 0.47, 0.56, big.format(n=round(1 / bp["beat_hold_return"])), 170, NEG, r, MONO, "bold")
    text(fig, 0.47, 0.43, foot, 40, TEXT, r, linespacing=1.2)


def draw_outro(fig, tl, a, b, s, pts):
    thesis1, thesis2, tagline, url, foot = L["outro"]
    text(fig, 0.47, 0.7, thesis1, 44, TEXT, a, SERIF)
    text(fig, 0.47, 0.65, thesis2, 44, ACCENT, a, SERIF)
    r = appear(tl, b["brand"] - 0.1, a)
    text(fig, 0.47, 0.52, "Quantify", 84, TEXT, r, SERIF, "bold")
    text(fig, 0.47, 0.455, tagline, 32, MUTED, r, linespacing=1.2)
    text(fig, 0.47, 0.37, url, 48, ACCENT, r, MONO, "bold")
    text(fig, 0.47, 0.325, foot, 28, MUTED, r, MONO)


DRAW = {"intro": draw_intro, "method": draw_method, "cloud": draw_cloud,
        "decay": draw_decay, "hold": draw_hold, "outro": draw_outro}


def render(scenes, silent: Path) -> float:
    s, pts = load()
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
                DRAW[sc["name"]](fig, tl, a, sc["beats"], s, pts)
        fig.canvas.draw()
        writer.append_data(np.asarray(fig.canvas.buffer_rgba())[:, :, :3])
        if i % 150 == 0:
            print(f"frame {t:5.1f}s / {total:.1f}s")
    writer.close()
    return total


def mux(silent: Path, cues, total: float, out: Path) -> None:
    args = [FFMPEG, "-y", "-loglevel", "error", "-i", str(silent)]
    for wav, _at in cues:
        args += ["-i", str(wav)]
    delays = ";".join(f"[{i + 1}:a]adelay={int(at * 1000)}|{int(at * 1000)}[a{i}]" for i, (_w, at) in enumerate(cues))
    mix = "".join(f"[a{i}]" for i in range(len(cues)))
    graph = f"{delays};{mix}amix=inputs={len(cues)}:normalize=0,apad,atrim=0:{total:.3f}[aout]"
    args += ["-filter_complex", graph, "-map", "0:v", "-map", "[aout]", "-c:v", "copy",
             "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)]
    subprocess.run(args, check=True)


def main() -> None:
    global L
    lang = sys.argv[1] if len(sys.argv) > 1 else "en"
    L = LANGS[lang]
    out = Path(__file__).resolve().parent / f"research_teaser_{lang}.mp4"
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        clips = synthesize(tmp)
        scenes, cues = plan(clips)
        for sc in scenes:
            print(f"{sc['name']:7} {sc['start']:5.1f}s +{sc['dur']:.1f}s")
        silent = tmp / "silent.mp4"
        total = render(scenes, silent)
        mux(silent, cues, total, out)
    print(f"saved {out} ({total:.1f}s)")


if __name__ == "__main__":
    main()
