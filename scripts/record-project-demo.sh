#!/usr/bin/env bash
# Quantify product demo — spicy montage: cold open, punch zooms, snappy cuts, beat bed, Kokoro VO.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-/opt/cursor/artifacts}"
WORKDIR="$(mktemp -d)"
URL="${DEMO_URL:-http://127.0.0.1:18081/}"
URL_BASE="${URL%/}"
DISPLAY_NUM="${DISPLAY:-:1}"
OUT_NAME="${DEMO_OUT:-quantify_demo_spicy.mp4}"
KOKORO_MODEL="${KOKORO_MODEL:-/tmp/kokoro/kokoro-v1.0.onnx}"
KOKORO_VOICES="${KOKORO_VOICES:-/tmp/kokoro/voices-v1.0.bin}"
KOKORO_VOICE="${KOKORO_VOICE:-am_michael}"
CDP_PORT="${CDP_PORT:-9223}"
W="${DEMO_W:-1920}"
H="${DEMO_H:-1200}"
PANEL_WAS_RUNNING=0

cleanup() {
  pkill -f "user-data-dir=/tmp/chrome-project-demo" 2>/dev/null || true
  pkill -f "ffmpeg.*x11grab.*${DISPLAY_NUM}" 2>/dev/null || true
  if [[ "$PANEL_WAS_RUNNING" -eq 1 ]] && ! pgrep -x xfce4-panel >/dev/null; then
    DISPLAY="$DISPLAY_NUM" xfce4-panel >/dev/null 2>&1 &
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT
mkdir -p "$OUT_DIR" "$WORKDIR/clips" "$WORKDIR/inserts"

if pgrep -x xfce4-panel >/dev/null; then
  PANEL_WAS_RUNNING=1
  DISPLAY="$DISPLAY_NUM" xfce4-panel -q 2>/dev/null || killall xfce4-panel 2>/dev/null || true
  sleep 0.3
fi

POLICY_JSON='{"ComponentUpdatesEnabled":false,"DefaultBrowserSettingEnabled":false,"BrowserSignin":0,"PromotionalTabsEnabled":false,"TranslateEnabled":false,"SuppressUnsupportedOSWarning":true,"UserFeedbackAllowed":false,"MetricsReportingEnabled":false}'
if sudo mkdir -p /etc/opt/chrome/policies/managed 2>/dev/null; then
  printf '%s\n' "$POLICY_JSON" | sudo tee /etc/opt/chrome/policies/managed/quantify-demo.json >/dev/null
fi

if [[ ! -f "$KOKORO_MODEL" || ! -f "$KOKORO_VOICES" ]]; then
  mkdir -p /tmp/kokoro
  [[ -f /tmp/kokoro/kokoro-v1.0.onnx ]] || curl -sL \
    'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx' \
    -o /tmp/kokoro/kokoro-v1.0.onnx
  [[ -f /tmp/kokoro/voices-v1.0.bin ]] || curl -sL \
    'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin' \
    -o /tmp/kokoro/voices-v1.0.bin
  KOKORO_MODEL=/tmp/kokoro/kokoro-v1.0.onnx
  KOKORO_VOICES=/tmp/kokoro/voices-v1.0.bin
fi

python3 -m pip install --user -q kokoro-onnx soundfile numpy websocket-client >/dev/null

# ── Punchy VO ─────────────────────────────────────────────────────────────────
python3 - <<PY
from pathlib import Path
import subprocess, wave
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

work = Path("$WORKDIR")
k = Kokoro("$KOKORO_MODEL", "$KOKORO_VOICES")
voice = "$KOKORO_VOICE"

# Short punches — attitude, not brochure copy (~65–70s VO for ~75s cut)
lines = [
    "This is Quantify.",
    "Free backtester. No signup. No API key. Ideas in — numbers out.",
    "Watch. Click a chip… and the console wakes up.",
    "Typing. Parsing. Spec. Fills. Equity. Boom — blotter.",
    "SMA crossover. That’s twelve percent on the curve — look at the blotter light up.",
    "RSI mean reversion. Same engine. Sharper teeth.",
    "EMA with stops. Bollinger bounce. Every chip rebuilds the whole run.",
    "Instant Try — paste anything. Hit run. You’re in a backtest in seconds.",
    "Fact of the day hits different. Strategy of the day? Steal it.",
    "Live counters. Real people testing. Not a brochure.",
    "Playbook presets — SMA, RSI, MACD, Bollinger — one click into the workspace.",
    "Edit the text. Set the risk. Hit run. Look-ahead safe fills. Desk metrics.",
    "That’s the workspace. No chat toy. Real simulation.",
    "Quantify. Free for everyone. Go break something.",
]

wavs = []
for i, text in enumerate(lines, 1):
    out = work / f"v{i}.wav"
    # Slightly faster = more energy, still human
    samples, sr = k.create(text, voice=voice, speed=0.90)
    sf.write(str(out), samples, sr)
    wavs.append(out)
    print("ok", out.name, f"{len(samples)/sr:.1f}s")

sr = sf.SoundFile(str(wavs[0])).samplerate
# Tight gaps — snappy montage feel
gap = np.zeros(int(sr * 0.38), dtype=np.float32)
silence = work / "silence.wav"
sf.write(str(silence), gap, sr)

lst = work / "list.txt"
with lst.open("w") as f:
    for i, w in enumerate(wavs):
        f.write(f"file '{w.resolve()}'\n")
        if i < len(wavs) - 1:
            f.write(f"file '{silence.resolve()}'\n")

voice_path = work / "voice.wav"
subprocess.check_call([
    "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(voice_path)
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

with wave.open(str(voice_path), "rb") as w:
    dur = w.getnframes() / float(w.getframerate())
print(f"VOICE_DURATION {dur:.1f}")
(work / "duration.txt").write_text(str(dur))

# Subtle beat bed — soft kick + tick, never fights the VO
dur_bed = max(dur + 8.0, 95.0)
t = np.arange(int(sr * dur_bed)) / sr
bed = np.zeros_like(t, dtype=np.float32)
bpm = 98.0
beat = 60.0 / bpm
for i, bt in enumerate(np.arange(0, dur_bed, beat)):
    n0 = int(bt * sr)
    # kick
    kn = int(0.08 * sr)
    if n0 + kn < len(bed):
        env = np.exp(-np.linspace(0, 18, kn))
        kick = 0.55 * env * np.sin(2 * np.pi * 58 * np.linspace(0, 0.08, kn))
        bed[n0:n0+kn] += kick.astype(np.float32)
    # soft hat on offbeats
    if i % 2 == 1:
        hn = int(0.03 * sr)
        if n0 + hn < len(bed):
            noise = np.random.randn(hn).astype(np.float32) * np.exp(-np.linspace(0, 25, hn))
            bed[n0:n0+hn] += 0.07 * noise
# very quiet sidechain-ish duck under assumed VO — keep bed low
bed *= 0.11
bed = np.clip(bed, -0.95, 0.95)
sf.write(str(work / "beat.wav"), bed, sr)
print("ok beat.wav", f"{dur_bed:.1f}s")
PY

echo "VO $(cat "$WORKDIR/duration.txt")s — spicy capture…"

# ── CDP ───────────────────────────────────────────────────────────────────────
cdp_py() {
  python3 - "$@" <<'PY'
import json, sys, time, urllib.request
import websocket
port=int(sys.argv[1]); cmd=sys.argv[2]; arg=sys.argv[3] if len(sys.argv)>3 else ""
tabs=json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json"))
page=next(t for t in tabs if t.get("type")=="page")
ws=websocket.create_connection(page["webSocketDebuggerUrl"], suppress_origin=True)
mid=1
def send(method, params=None):
    global mid
    payload={"id":mid,"method":method}
    if params: payload["params"]=params
    ws.send(json.dumps(payload)); this=mid; mid+=1
    while True:
        r=json.loads(ws.recv())
        if r.get("id")==this: return r
send("Page.enable"); send("Runtime.enable")
if cmd=="navigate":
    send("Page.navigate",{"url":arg}); time.sleep(1.15)
elif cmd=="eval":
    r=send("Runtime.evaluate",{"expression":arg,"awaitPromise":True,"returnByValue":True})
    v=(r or {}).get("result",{}).get("result",{}).get("value")
    if v is not None: print(v)
ws.close()
PY
}
cdp_nav(){ cdp_py "$CDP_PORT" navigate "$1"; }
cdp_eval(){ cdp_py "$CDP_PORT" eval "$1"; }

record_clip() {
  local name="$1" secs="$2"
  ffmpeg -y -video_size "${W}x${H}" -framerate 30 -f x11grab -i "${DISPLAY_NUM}+0,0" \
    -t "$secs" -c:v libx264 -pix_fmt yuv420p -preset ultrafast \
    "$WORKDIR/clips/${name}.mp4" >/tmp/demo-clip-"$name".log 2>&1
  echo "clip $name ${secs}s"
}

# Crop a punch insert from a full clip around demo console / KPIs
make_punch() {
  # make_punch <src_clip> <out_name> <start_sec> <dur> [zoom]
  local src="$WORKDIR/clips/$1.mp4" out="$WORKDIR/inserts/$2.mp4"
  local ss="$3" dur="$4" zoom="${5:-1.35}"
  # Center-weighted punch (console sits mid-lower on landing)
  ffmpeg -y -ss "$ss" -i "$src" -t "$dur" \
    -vf "scale=iw*${zoom}:ih*${zoom},crop=1920:1200:(iw-1920)/2:(ih-1200)/2+80,fps=30,format=yuv420p" \
    -c:v libx264 -preset fast -crf 18 -an "$out" \
    >/tmp/demo-punch-"$2".log 2>&1
  echo "punch $2"
}

# Accent flash frame (mint pop between cuts)
make_flash() {
  ffmpeg -y -f lavfi -i "color=c=0x4fd6a0:s=1920x1200:d=0.07:r=30" \
    -c:v libx264 -pix_fmt yuv420p -preset ultrafast \
    "$WORKDIR/inserts/flash.mp4" >/dev/null 2>&1
}

# ── Chrome kiosk ──────────────────────────────────────────────────────────────
pkill -f 'user-data-dir=/tmp/chrome-project-demo' 2>/dev/null || true
sleep 0.4
rm -rf /tmp/chrome-project-demo
mkdir -p /tmp/chrome-project-demo/Default
printf '%s\n' '{"browser":{"check_default_browser":false,"has_seen_welcome_page":true}}' \
  > /tmp/chrome-project-demo/Default/Preferences

google-chrome \
  --no-sandbox --disable-gpu --disable-infobars --no-first-run \
  --disable-features=TranslateUI,ChromeWhatsNewUI \
  --check-for-update-interval=31536000 --disable-component-update \
  --disable-background-networking --disable-default-apps --disable-sync --disable-extensions \
  --remote-debugging-port="$CDP_PORT" \
  --user-data-dir=/tmp/chrome-project-demo \
  --kiosk "${URL_BASE}/" \
  >/tmp/chrome-project-demo.log 2>&1 &

for i in $(seq 1 50); do
  curl -sf "http://127.0.0.1:${CDP_PORT}/json" >/dev/null && break
  sleep 0.2
done
sleep 2.2

# ── Capture scenes ────────────────────────────────────────────────────────────
cdp_nav "${URL_BASE}/"
cdp_eval "window.scrollTo(0,0); true"
sleep 0.6

# Hero sting
record_clip 01_hero 5
DISPLAY="$DISPLAY_NUM" xdotool mousemove --sync 430 510

# Jump to demo, fire SMA, record the whole reaction including results
cdp_eval "document.getElementById('demo')?.scrollIntoView({behavior:'instant',block:'center'}); true"
sleep 0.7
record_clip 02_sma_run 11 &
REC=$!
sleep 0.5
cdp_eval "(()=>{const c=[...document.querySelectorAll('.demo-chip')].filter(x=>!x.classList.contains('ghost-chip')); c[0]?.click(); return c[0]?.textContent;})()"
wait "$REC" || true

# RSI — click then hold for results
record_clip 03_rsi_run 10 &
REC=$!
sleep 0.4
cdp_eval "(()=>{const c=[...document.querySelectorAll('.demo-chip')].filter(x=>!x.classList.contains('ghost-chip')); c[1]?.click(); return c[1]?.textContent;})()"
wait "$REC" || true

# EMA
record_clip 04_ema_run 10 &
REC=$!
sleep 0.4
cdp_eval "(()=>{const c=[...document.querySelectorAll('.demo-chip')].filter(x=>!x.classList.contains('ghost-chip')); c[2]?.click(); return c[2]?.textContent;})()"
wait "$REC" || true

# Bollinger for extra teeth
record_clip 05_bb_run 9 &
REC=$!
sleep 0.4
cdp_eval "(()=>{const c=[...document.querySelectorAll('.demo-chip')].filter(x=>!x.classList.contains('ghost-chip')); c[3]?.click(); return c[3]?.textContent;})()"
wait "$REC" || true

# Instant Try
cdp_eval "document.getElementById('try')?.scrollIntoView({behavior:'instant',block:'center'}); true"
sleep 0.6
record_clip 06_instant 7 &
REC=$!
sleep 0.8
cdp_eval "(()=>{const chip=document.querySelector('#try .chip'); chip?.click(); return (chip?.textContent||'').slice(0,32);})()"
sleep 1.2
cdp_eval "(()=>{const b=document.querySelector('#try button.btn.primary, .instant-section button.btn.primary'); return b?.textContent||'no';})()"
DISPLAY="$DISPLAY_NUM" xdotool mousemove --sync 520 780
wait "$REC" || true

# Fact + SOTD rapid
cdp_eval "document.querySelector('.daily-fact-section')?.scrollIntoView({behavior:'instant',block:'center'}); true"
sleep 0.5
record_clip 07_fact 5
cdp_eval "document.querySelector('.sotd-section')?.scrollIntoView({behavior:'instant',block:'center'}); true"
sleep 0.4
record_clip 08_sotd 5

# Live counters
cdp_eval "document.querySelector('.live-stats-section')?.scrollIntoView({behavior:'instant',block:'center'}); true"
sleep 0.5
record_clip 09_pulse 6

# Playbook
cdp_nav "${URL_BASE}/playbook"
sleep 1.2
record_clip 10_playbook 8 &
REC=$!
sleep 1.5
cdp_eval "window.scrollTo({top:240,behavior:'smooth'}); true"
sleep 3
DISPLAY="$DISPLAY_NUM" xdotool mousemove --sync 480 500
wait "$REC" || true

# Workspace — run
cdp_nav "${URL_BASE}/app"
sleep 1.6
record_clip 11_workspace 12 &
REC=$!
sleep 1.5
cdp_eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/run backtest/i.test(x.textContent||'')); b?.click(); return b?.textContent||'no';})()"
sleep 7
wait "$REC" || true

# Close hero
cdp_nav "${URL_BASE}/"
cdp_eval "window.scrollTo(0,0); true"
sleep 0.7
record_clip 12_close 5

# ── Build punches + flash ─────────────────────────────────────────────────────
make_flash
# Late-in-clip punches when results should be on screen (~7-9s into demo runs)
make_punch 02_sma_run punch_sma 7.2 2.2 1.42
make_punch 03_rsi_run punch_rsi 6.8 2.0 1.45
make_punch 04_ema_run punch_ema 6.8 2.0 1.42
make_punch 05_bb_run punch_bb 6.2 1.8 1.48
make_punch 11_workspace punch_run 8.0 2.4 1.28

# ── Assemble spicy edit ───────────────────────────────────────────────────────
python3 - <<PY
import json, subprocess
from pathlib import Path

work = Path("$WORKDIR")
clips = work / "clips"
ins = work / "inserts"
out_dir = Path("$OUT_DIR")
out_name = "$OUT_NAME"

def norm(src: Path, dst: Path, punch=False, zoom=1.0):
    if punch:
        # already 1920x1200
        vf = "fps=30,format=yuv420p"
    elif zoom > 1.01:
        vf = f"scale=iw*{zoom}:ih*{zoom},crop=1920:1200:(iw-1920)/2:(ih-1200)/2,fps=30,format=yuv420p"
    else:
        vf = "scale=1920:1200:force_original_aspect_ratio=decrease,pad=1920:1200:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p"
    subprocess.check_call([
        "ffmpeg", "-y", "-i", str(src), "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-an", str(dst),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# Edit timeline: cold open punch → flash → hero → demo runs with insert punches
# Trim long runs so pacing stays hot
def trim(src: Path, dst: Path, ss: float, dur: float, zoom=1.0):
    zvf = ""
    if zoom > 1.01:
        zvf = f"scale=iw*{zoom}:ih*{zoom},crop=1920:1200:(iw-1920)/2:(ih-1200)/2,"
    vf = f"{zvf}fps=30,format=yuv420p"
    subprocess.check_call([
        "ffmpeg", "-y", "-ss", str(ss), "-i", str(src), "-t", str(dur),
        "-vf", vf, "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-an", str(dst),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

seq_dir = work / "seq"
seq_dir.mkdir(exist_ok=True)
steps = []

def add(path: Path):
    steps.append(path)

flash = ins / "flash.mp4"

# Cold open: SMA results punch
norm(ins / "punch_sma.mp4", seq_dir / "s00.mp4", punch=True); add(seq_dir / "s00.mp4")
norm(flash, seq_dir / "f00.mp4", punch=True); add(seq_dir / "f00.mp4")

trim(clips / "01_hero.mp4", seq_dir / "s01.mp4", 0.3, 3.8); add(seq_dir / "s01.mp4")
norm(flash, seq_dir / "f01.mp4", punch=True); add(seq_dir / "f01.mp4")

# Demo SMA full-ish then hard punch
trim(clips / "02_sma_run.mp4", seq_dir / "s02.mp4", 0.2, 6.5); add(seq_dir / "s02.mp4")
norm(ins / "punch_sma.mp4", seq_dir / "s02p.mp4", punch=True); add(seq_dir / "s02p.mp4")
norm(flash, seq_dir / "f02.mp4", punch=True); add(seq_dir / "f02.mp4")

trim(clips / "03_rsi_run.mp4", seq_dir / "s03.mp4", 0.2, 5.8); add(seq_dir / "s03.mp4")
norm(ins / "punch_rsi.mp4", seq_dir / "s03p.mp4", punch=True); add(seq_dir / "s03p.mp4")
norm(flash, seq_dir / "f03.mp4", punch=True); add(seq_dir / "f03.mp4")

trim(clips / "04_ema_run.mp4", seq_dir / "s04.mp4", 0.2, 5.5); add(seq_dir / "s04.mp4")
norm(ins / "punch_ema.mp4", seq_dir / "s04p.mp4", punch=True); add(seq_dir / "s04p.mp4")
norm(flash, seq_dir / "f04.mp4", punch=True); add(seq_dir / "f04.mp4")

trim(clips / "05_bb_run.mp4", seq_dir / "s05.mp4", 0.2, 5.0); add(seq_dir / "s05.mp4")
norm(ins / "punch_bb.mp4", seq_dir / "s05p.mp4", punch=True); add(seq_dir / "s05p.mp4")
norm(flash, seq_dir / "f05.mp4", punch=True); add(seq_dir / "f05.mp4")

trim(clips / "06_instant.mp4", seq_dir / "s06.mp4", 0.2, 5.5, zoom=1.08); add(seq_dir / "s06.mp4")
norm(flash, seq_dir / "f06.mp4", punch=True); add(seq_dir / "f06.mp4")

trim(clips / "07_fact.mp4", seq_dir / "s07.mp4", 0.2, 3.6, zoom=1.12); add(seq_dir / "s07.mp4")
trim(clips / "08_sotd.mp4", seq_dir / "s08.mp4", 0.2, 3.8, zoom=1.10); add(seq_dir / "s08.mp4")
norm(flash, seq_dir / "f07.mp4", punch=True); add(seq_dir / "f07.mp4")

trim(clips / "09_pulse.mp4", seq_dir / "s09.mp4", 0.3, 4.5, zoom=1.15); add(seq_dir / "s09.mp4")
norm(flash, seq_dir / "f08.mp4", punch=True); add(seq_dir / "f08.mp4")

trim(clips / "10_playbook.mp4", seq_dir / "s10.mp4", 0.4, 6.0); add(seq_dir / "s10.mp4")
norm(flash, seq_dir / "f09.mp4", punch=True); add(seq_dir / "f09.mp4")

trim(clips / "11_workspace.mp4", seq_dir / "s11.mp4", 0.3, 7.5); add(seq_dir / "s11.mp4")
norm(ins / "punch_run.mp4", seq_dir / "s11p.mp4", punch=True); add(seq_dir / "s11p.mp4")
norm(flash, seq_dir / "f10.mp4", punch=True); add(seq_dir / "f10.mp4")

trim(clips / "12_close.mp4", seq_dir / "s12.mp4", 0.2, 4.0); add(seq_dir / "s12.mp4")

lst = work / "concat.txt"
with lst.open("w") as f:
    for p in steps:
        f.write(f"file '{p.resolve()}'\n")

silent = work / "montage_silent.mp4"
subprocess.check_call([
    "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(silent)
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

probe = json.loads(subprocess.check_output([
    "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(silent)
]))
vdur = float(probe["format"]["duration"])
print(f"MONTAGE_VIDEO {vdur:.1f} clips={len(steps)}")

# Mix VO + beat, pad/trim to video, light VO duck via volume
voice = work / "voice.wav"
beat = work / "beat.wav"
final = out_dir / out_name
fade = max(0.4, vdur - 1.1)
# voice louder, beat under; video stream copied as-is
fc = (
    f"[1:a]volume=1.05,apad,atrim=0:{vdur:.3f}[vo];"
    f"[2:a]volume=0.60,apad,atrim=0:{vdur:.3f}[bd];"
    f"[vo][bd]amix=inputs=2:duration=first:dropout_transition=0,"
    f"alimiter=limit=0.95,afade=t=out:st={fade:.3f}:d=1.0[a]"
)
subprocess.check_call([
    "ffmpeg", "-y",
    "-i", str(silent),
    "-i", str(voice),
    "-i", str(beat),
    "-filter_complex", fc,
    "-map", "0:v", "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
    "-shortest",
    "-movflags", "+faststart",
    str(final),
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print(f"DEMO_READY {final}")
print(f"FINAL_DURATION {vdur:.1f}")
PY

FINAL="$OUT_DIR/$OUT_NAME"
ls -lah "$FINAL"
ffprobe -hide_banner "$FINAL" 2>&1 | head -16
echo "DEMO_READY $FINAL"
