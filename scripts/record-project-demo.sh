#!/usr/bin/env bash
# Quantify product demo — longer montage (multi-scene cuts), Kokoro human VO, Chrome kiosk.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-/opt/cursor/artifacts}"
WORKDIR="$(mktemp -d)"
URL="${DEMO_URL:-http://127.0.0.1:18081/}"
URL_BASE="${URL%/}"
DISPLAY_NUM="${DISPLAY:-:1}"
OUT_NAME="${DEMO_OUT:-quantify_product_demo_montage.mp4}"
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
mkdir -p "$OUT_DIR" "$WORKDIR/clips"

if pgrep -x xfce4-panel >/dev/null; then
  PANEL_WAS_RUNNING=1
  DISPLAY="$DISPLAY_NUM" xfce4-panel -q 2>/dev/null || killall xfce4-panel 2>/dev/null || true
  sleep 0.4
fi

POLICY_JSON='{
  "ComponentUpdatesEnabled": false,
  "DefaultBrowserSettingEnabled": false,
  "BrowserSignin": 0,
  "PromotionalTabsEnabled": false,
  "TranslateEnabled": false,
  "SuppressUnsupportedOSWarning": true,
  "UserFeedbackAllowed": false,
  "MetricsReportingEnabled": false
}'
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

# ── Voiceover: ~100s of natural copy ──────────────────────────────────────────
python3 - <<PY
from pathlib import Path
import subprocess
import wave
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

work = Path("$WORKDIR")
kokoro = Kokoro("$KOKORO_MODEL", "$KOKORO_VOICES")
voice_name = "$KOKORO_VOICE"

# Longer beats — each line is a montage chapter
lines = [
    "Hey — this is Quantify. A free trading strategy backtester. No signup. No API key. Just ideas to numbers.",
    "Here’s the landing. Brand up front, and a live workspace preview that actually types and parses a strategy.",
    "Scroll into the live demo — this is the fun part. Click any strategy chip, and the console reacts right away.",
    "SMA crossover… watch it type, build the spec, simulate fills, then drop an equity curve and blotter.",
    "RSI mean reversion… same loop, new numbers. EMA with stops… again — every chip rebuilds the whole run.",
    "Drop further for Instant Try. Paste any idea you want — SMA, MACD, Bollinger — and run a free backtest in seconds.",
    "Fact of the day keeps it sharp. Strategy of the day gives you something stealable when you blank.",
    "Open the playbook. Ready-made presets — SMA, RSI, Bollinger, MACD — one click into the workspace.",
    "Inside the workspace you edit the text, pick your data, and hit run. Look-ahead safe fills. Real desk metrics.",
    "That’s Quantify. Free for everyone. Go break a strategy — on purpose.",
]

wavs = []
for i, text in enumerate(lines, 1):
    out = work / f"v{i}.wav"
    samples, sample_rate = kokoro.create(text, voice=voice_name, speed=0.84)
    sf.write(str(out), samples, sample_rate)
    wavs.append(out)
    print("ok", out.name, f"{len(samples)/sample_rate:.1f}s")

with sf.SoundFile(str(wavs[0])) as f:
    sr = f.samplerate

# Slightly longer gaps = breathing room between montage cuts
silence = work / "silence.wav"
sf.write(str(silence), np.zeros(int(sr * 0.75), dtype=np.float32), sr)

lst = work / "list.txt"
with lst.open("w") as f:
    for i, w in enumerate(wavs):
        f.write(f"file '{w.resolve()}'\n")
        if i < len(wavs) - 1:
            f.write(f"file '{silence.resolve()}'\n")

voice = work / "voice.wav"
subprocess.check_call([
    "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(voice)
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

with wave.open(str(voice), "rb") as w:
    dur = w.getnframes() / float(w.getframerate())
print(f"VOICE_DURATION {dur:.1f}")
(work / "duration.txt").write_text(str(dur))
# Per-line durations for scene timing hints
durs = []
for w in wavs:
    with wave.open(str(w), "rb") as wf:
        durs.append(wf.getnframes() / float(wf.getframerate()))
(work / "line_durs.txt").write_text("\n".join(f"{d:.2f}" for d in durs))
PY

VOICE_DUR=$(cat "$WORKDIR/duration.txt")
echo "Voiceover ${VOICE_DUR}s — recording montage scenes…"

# ── CDP helpers ───────────────────────────────────────────────────────────────
cdp_py() {
  python3 - "$@" <<'PY'
import json, sys, time, urllib.request
import websocket

port = int(sys.argv[1])
cmd = sys.argv[2]
arg = sys.argv[3] if len(sys.argv) > 3 else ""

base = f"http://127.0.0.1:{port}"
tabs = json.load(urllib.request.urlopen(base + "/json"))
page = next(t for t in tabs if t.get("type") == "page")
ws = websocket.create_connection(page["webSocketDebuggerUrl"], suppress_origin=True)
mid = 1

def send(method, params=None, wait=True):
    global mid
    payload = {"id": mid, "method": method}
    if params:
        payload["params"] = params
    ws.send(json.dumps(payload))
    this_id = mid
    mid += 1
    if not wait:
        return None
    while True:
        resp = json.loads(ws.recv())
        if resp.get("id") == this_id:
            return resp

send("Page.enable")
send("Runtime.enable")

if cmd == "navigate":
    send("Page.navigate", {"url": arg})
    time.sleep(1.2)
elif cmd == "eval":
    r = send("Runtime.evaluate", {
        "expression": arg,
        "awaitPromise": True,
        "returnByValue": True,
    })
    val = (r or {}).get("result", {}).get("result", {}).get("value")
    if val is not None:
        print(val)
elif cmd == "wait":
    time.sleep(float(arg or "0.5"))

ws.close()
PY
}

cdp_nav() { cdp_py "$CDP_PORT" navigate "$1"; }
cdp_eval() { cdp_py "$CDP_PORT" eval "$1"; }

record_clip() {
  # record_clip <name> <seconds>
  local name="$1" secs="$2"
  local out="$WORKDIR/clips/${name}.mp4"
  ffmpeg -y -video_size "${W}x${H}" -framerate 30 -f x11grab -i "${DISPLAY_NUM}+0,0" \
    -t "$secs" -c:v libx264 -pix_fmt yuv420p -preset ultrafast "$out" \
    >/tmp/demo-clip-"$name".log 2>&1
  echo "clip $name ${secs}s -> $out"
}

# ── Launch kiosk Chrome ───────────────────────────────────────────────────────
pkill -f 'user-data-dir=/tmp/chrome-project-demo' 2>/dev/null || true
sleep 0.4
rm -rf /tmp/chrome-project-demo
mkdir -p /tmp/chrome-project-demo/Default
cat > /tmp/chrome-project-demo/Default/Preferences <<'JSON'
{
  "browser": {"check_default_browser": false, "has_seen_welcome_page": true},
  "distribution": {"skip_first_run_ui": true, "show_welcome_page": false},
  "profile": {"default_content_setting_values": {"notifications": 2}}
}
JSON

google-chrome \
  --no-sandbox --disable-gpu --disable-infobars --no-first-run \
  --disable-features=TranslateUI,ChromeWhatsNewUI,InfiniteSessionRestore \
  --check-for-update-interval=31536000 \
  --disable-component-update --disable-background-networking \
  --disable-default-apps --disable-sync --disable-extensions \
  --no-default-browser-check \
  --remote-debugging-port="$CDP_PORT" \
  --user-data-dir=/tmp/chrome-project-demo \
  --kiosk "${URL_BASE}/" \
  >/tmp/chrome-project-demo.log 2>&1 &

for i in $(seq 1 50); do
  curl -sf "http://127.0.0.1:${CDP_PORT}/json" >/dev/null 2>&1 && break
  sleep 0.2
done
sleep 2.5

# Dismiss update dialogs if any
while read -r wid; do
  [[ -n "$wid" ]] || continue
  name=$(DISPLAY="$DISPLAY_NUM" xdotool getwindowname "$wid" 2>/dev/null || true)
  case "$name" in
    *update*|*Update*|*Reinstall*) DISPLAY="$DISPLAY_NUM" xdotool windowkill "$wid" 2>/dev/null || true ;;
  esac
done < <(DISPLAY="$DISPLAY_NUM" xdotool search --class 'Google-chrome' 2>/dev/null || true)

# ── Scene plan (montage chapters) ─────────────────────────────────────────────
# 01 hero open
cdp_nav "${URL_BASE}/"
cdp_eval "window.scrollTo({top:0,behavior:'instant'}); true"
sleep 0.8
record_clip 01_hero 9 &
REC=$!
sleep 3
# subtle mouse drift over hero CTA
DISPLAY="$DISPLAY_NUM" xdotool mousemove --sync 420 520
sleep 2
DISPLAY="$DISPLAY_NUM" xdotool mousemove --sync 980 480
wait "$REC" || true

# 02 hero workspace preview (still top)
record_clip 02_hero_preview 7 &
REC=$!
sleep 2
DISPLAY="$DISPLAY_NUM" xdotool mousemove --sync 1200 420
sleep 3
wait "$REC" || true

# 03 scroll to live demo + click SMA
cdp_eval "document.getElementById('demo')?.scrollIntoView({behavior:'instant',block:'center'}); true"
sleep 1.0
record_clip 03_demo_sma 12 &
REC=$!
sleep 1.2
cdp_eval "(() => { const chips=[...document.querySelectorAll('.demo-chip')].filter(c=>!c.classList.contains('ghost-chip')); chips[0]?.click(); return chips[0]?.textContent||'none'; })()"
sleep 5
DISPLAY="$DISPLAY_NUM" xdotool mousemove --sync 700 700
wait "$REC" || true

# 04 RSI chip reaction
record_clip 04_demo_rsi 10 &
REC=$!
sleep 0.8
cdp_eval "(() => { const chips=[...document.querySelectorAll('.demo-chip')].filter(c=>!c.classList.contains('ghost-chip')); chips[1]?.click(); return chips[1]?.textContent||'none'; })()"
sleep 6
wait "$REC" || true

# 05 EMA chip + equity results
record_clip 05_demo_ema 11 &
REC=$!
sleep 0.8
cdp_eval "(() => { const chips=[...document.querySelectorAll('.demo-chip')].filter(c=>!c.classList.contains('ghost-chip')); chips[2]?.click(); return chips[2]?.textContent||'none'; })()"
sleep 7
wait "$REC" || true

# 06 Instant Try section
cdp_eval "document.getElementById('try')?.scrollIntoView({behavior:'instant',block:'center'}); true"
sleep 1.0
record_clip 06_instant 10 &
REC=$!
sleep 1.5
cdp_eval "(() => { const chip=document.querySelector('#try .chip, .instant-section .chip'); chip?.click(); return (chip?.textContent||'nochip').trim().slice(0,40); })()"
sleep 3
DISPLAY="$DISPLAY_NUM" xdotool mousemove --sync 640 720
wait "$REC" || true

# 07 Fact + Strategy of the day
cdp_eval "document.querySelector('.daily-fact-section')?.scrollIntoView({behavior:'instant',block:'center'}); true"
sleep 1.0
record_clip 07_fact_strategy 10 &
REC=$!
sleep 4
cdp_eval "document.querySelector('.sotd-section')?.scrollIntoView({behavior:'instant',block:'center'}); true"
sleep 4
wait "$REC" || true

# 08 Live stats / pulse
cdp_eval "document.querySelector('.live-stats-section')?.scrollIntoView({behavior:'instant',block:'center'}); true"
sleep 0.8
record_clip 08_pulse 8 &
REC=$!
sleep 5
wait "$REC" || true

# 09 Playbook page
cdp_nav "${URL_BASE}/playbook"
sleep 1.5
record_clip 09_playbook 12 &
REC=$!
sleep 2
cdp_eval "window.scrollTo({top:280,behavior:'smooth'}); true"
sleep 4
DISPLAY="$DISPLAY_NUM" xdotool mousemove --sync 500 520
sleep 2
DISPLAY="$DISPLAY_NUM" xdotool mousemove --sync 980 520
wait "$REC" || true

# 10 Workspace
cdp_nav "${URL_BASE}/app"
sleep 2.0
record_clip 10_workspace 14 &
REC=$!
sleep 2
cdp_eval "(() => { const ta=document.querySelector('textarea'); if(ta){ ta.focus(); } return !!ta; })()"
sleep 2
DISPLAY="$DISPLAY_NUM" xdotool mousemove --sync 700 400
sleep 3
# click run if present
cdp_eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>/run|backtest|simulate/i.test(x.textContent||'')); b?.click(); return b?.textContent||'nobtn'; })()"
sleep 5
wait "$REC" || true

# 11 Guide teaser then back to hero CTA
cdp_nav "${URL_BASE}/guide"
sleep 1.2
record_clip 11_guide 6 &
REC=$!
sleep 4
wait "$REC" || true

cdp_nav "${URL_BASE}/"
cdp_eval "window.scrollTo({top:0,behavior:'instant'}); true"
sleep 1.0
record_clip 12_close 8 &
REC=$!
sleep 2
DISPLAY="$DISPLAY_NUM" xdotool mousemove --sync 420 520
sleep 3
wait "$REC" || true

# ── Montage assemble ──────────────────────────────────────────────────────────
# Hard cuts between scenes + optional light zoom on a few clips for energy
python3 - <<PY
import subprocess
from pathlib import Path

work = Path("$WORKDIR")
clips_dir = work / "clips"
order = [
    "01_hero",
    "02_hero_preview",
    "03_demo_sma",
    "04_demo_rsi",
    "05_demo_ema",
    "06_instant",
    "07_fact_strategy",
    "08_pulse",
    "09_playbook",
    "10_workspace",
    "11_guide",
    "12_close",
]
paths = []
for name in order:
    p = clips_dir / f"{name}.mp4"
    if not p.exists():
        raise SystemExit(f"missing clip {p}")
    paths.append(p)

# Normalize each clip to same timebase, then concat
norm_list = work / "norm_list.txt"
normed = []
for i, p in enumerate(paths):
    out = clips_dir / f"n{i:02d}.mp4"
    # Slight punch-in on demo / workspace clips
    punch = i in (2, 3, 4, 9)
    if punch:
        # zoom 1.0 -> 1.06 over clip via scale+crop
        vf = (
            "scale=1920:1200,"
            "zoompan=z='min(1.06,1+0.0015*on)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1200:fps=30,"
            "fps=30,format=yuv420p"
        )
        # zoompan d=1 per frame can be flaky; use simpler scale crop instead
        vf = "scale=2036:1272,crop=1920:1200,fps=30,format=yuv420p"
    else:
        vf = "scale=1920:1200:force_original_aspect_ratio=decrease,pad=1920:1200:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p"
    subprocess.check_call([
        "ffmpeg", "-y", "-i", str(p),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-an", str(out),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    normed.append(out)
    print("norm", out.name)

lst = work / "concat.txt"
with lst.open("w") as f:
    for p in normed:
        f.write(f"file '{p.resolve()}'\n")

silent = work / "montage_silent.mp4"
subprocess.check_call([
    "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
    "-c", "copy", str(silent),
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# Probe duration
import json
probe = subprocess.check_output([
    "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(silent)
])
vdur = float(json.loads(probe)["format"]["duration"])
print(f"MONTAGE_VIDEO {vdur:.1f}")

voice = work / "voice.wav"
final = Path("$OUT_DIR") / "$OUT_NAME"

# If video longer than voice, keep video and pad voice with silence; if shorter, loop last frame feel via -shortest false and pad video
# Prefer: keep full montage, pad/trim audio to match video with a soft fade-out
subprocess.check_call([
    "ffmpeg", "-y",
    "-i", str(silent),
    "-i", str(voice),
    "-filter_complex",
    "[1:a]apad,atrim=0:{vdur:.3f},afade=t=out:st={fade:.3f}:d=1.2[a]".format(
        vdur=vdur, fade=max(0.5, vdur - 1.2)
    ),
    "-map", "0:v", "-map", "[a]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
    "-movflags", "+faststart",
    str(final),
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

print(f"DEMO_READY {final}")
print(f"FINAL_DURATION {vdur:.1f}")
PY

FINAL="$OUT_DIR/$OUT_NAME"
ls -lah "$FINAL"
ffprobe -hide_banner "$FINAL" 2>&1 | head -18
echo "DEMO_READY $FINAL"
