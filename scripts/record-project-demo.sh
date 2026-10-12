#!/usr/bin/env bash
# Quantify product demo — neural voice, no subtitles, slower pacing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-/opt/cursor/artifacts}"
WORKDIR="$(mktemp -d)"
URL="${DEMO_URL:-http://127.0.0.1:18081/}"
DISPLAY_NUM="${DISPLAY:-:1}"
VOICE="${DEMO_VOICE:-en-US-AndrewNeural}"
OUT_NAME="${DEMO_OUT:-quantify_product_demo_human.mp4}"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT
mkdir -p "$OUT_DIR"

# Longer lines, natural pauses via SSML-ish commas / periods
python3 - <<PY
import asyncio, edge_tts, subprocess, wave
from pathlib import Path

work = Path("$WORKDIR")
voice = "$VOICE"
lines = [
    "Hey — this is Quantify. A free trading strategy backtester. No signup, and no API key.",
    "Here on the landing page, you can watch a live demo turn plain English into a real simulation.",
    "Click any strategy chip… and the console reacts right away — typing, parsing, then results.",
    "Or jump into Instant Try. Paste any idea you want, and run a free backtest in seconds.",
    "Browse the playbook for ready-made strategies… or open the workspace and start from scratch.",
    "That’s Quantify. Look-ahead safe fills. Free for everyone. Go try it.",
]

async def synth():
    paths = []
    for i, text in enumerate(lines, 1):
        # Slightly slower rate for a calmer demo
        communicate = edge_tts.Communicate(text, voice, rate="-8%")
        out = work / f"v{i}.mp3"
        await communicate.save(str(out))
        paths.append(out)
        print("voice", out.name, "ok")
    return paths

paths = asyncio.run(synth())

# Convert + concat with gaps via ffmpeg
parts = []
for i, p in enumerate(paths, 1):
    wav = work / f"c{i}.wav"
    subprocess.check_call([
        "ffmpeg", "-y", "-i", str(p), "-ar", "44100", "-ac", "1", str(wav)
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    parts.append(wav)

# Build concat list with 0.7s silence between lines
silence = work / "silence.wav"
subprocess.check_call([
    "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.75", str(silence)
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

lst = work / "list.txt"
with lst.open("w") as f:
    for i, w in enumerate(parts):
        f.write(f"file '{w}'\n")
        if i < len(parts) - 1:
            f.write(f"file '{silence}'\n")

voice = work / "voice.wav"
subprocess.check_call([
    "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(voice)
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# duration
import wave as W
with W.open(str(voice), "rb") as w:
    dur = w.getnframes() / float(w.getframerate())
print(f"VOICE_DURATION {dur:.1f}")
(work / "duration.txt").write_text(str(dur))
PY

DUR=$(cat "$WORKDIR/duration.txt")
# Pad video a bit longer than voice
VID_SECS=$(python3 -c "print(int(float('$DUR') + 4))")
echo "Recording ${VID_SECS}s of UI…"

pkill -f 'user-data-dir=/tmp/chrome-project-demo' 2>/dev/null || true
google-chrome --no-sandbox --disable-gpu --window-size=1440,900 \
  --window-position=40,40 \
  --user-data-dir=/tmp/chrome-project-demo \
  "$URL" >/tmp/chrome-project-demo.log 2>&1 &
sleep 5

WID=$(DISPLAY="$DISPLAY_NUM" xdotool search --name 'Quantify' | head -1 || true)
if [[ -n "${WID:-}" ]]; then
  DISPLAY="$DISPLAY_NUM" xdotool windowactivate --sync "$WID"
  DISPLAY="$DISPLAY_NUM" xdotool windowmove "$WID" 40 40
  DISPLAY="$DISPLAY_NUM" xdotool windowsize "$WID" 1440 900
fi

RAW="$WORKDIR/raw.mp4"
ffmpeg -y -video_size 1440x900 -framerate 30 -f x11grab -i "${DISPLAY_NUM}+40,40" \
  -t "$VID_SECS" -c:v libx264 -pix_fmt yuv420p -preset ultrafast "$RAW" >/tmp/demo-rec.log 2>&1 &
REC_PID=$!
sleep 1.5

run() { DISPLAY="$DISPLAY_NUM" xdotool "$@"; }

# Slower UI choreography timed to narration
sleep 2.5
run key --delay 80 Page_Down
sleep 3.5
run key --delay 80 Page_Down
sleep 3.0
run mousemove --sync 420 530 click 1
sleep 3.8
run mousemove --sync 580 530 click 1
sleep 3.8
run mousemove --sync 740 530 click 1
sleep 3.5
run key --delay 90 Page_Down
sleep 3.0
run key --delay 90 Page_Down
sleep 2.8
run mousemove --sync 400 660 click 1
sleep 2.5
run key --delay 60 ctrl+l
sleep 0.4
run type --delay 18 "${URL}playbook"
run key Return
sleep 4.5
run key --delay 60 ctrl+l
sleep 0.4
run type --delay 18 "${URL}app"
run key Return
sleep 4.5
run key --delay 60 ctrl+l
sleep 0.4
run type --delay 18 "$URL"
run key Return
sleep 3.5

wait "$REC_PID" || true

FINAL="$OUT_DIR/$OUT_NAME"
# No subtitles — neural voice only
ffmpeg -y -i "$RAW" -i "$WORKDIR/voice.wav" \
  -c:v libx264 -pix_fmt yuv420p -preset fast -crf 19 \
  -c:a aac -b:a 160k -ar 44100 -shortest \
  "$FINAL" >/tmp/demo-mux.log 2>&1

pkill -f 'user-data-dir=/tmp/chrome-project-demo' 2>/dev/null || true
ls -lah "$FINAL"
ffprobe -hide_banner "$FINAL" 2>&1 | head -14
echo "DEMO_READY $FINAL"
