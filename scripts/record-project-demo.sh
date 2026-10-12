#!/usr/bin/env bash
# Quantify product demo — Piper neural voice, no subtitles, slower pacing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-/opt/cursor/artifacts}"
WORKDIR="$(mktemp -d)"
URL="${DEMO_URL:-http://127.0.0.1:18081/}"
DISPLAY_NUM="${DISPLAY:-:1}"
OUT_NAME="${DEMO_OUT:-quantify_product_demo_human.mp4}"
PIPER_BIN="${PIPER_BIN:-/tmp/piper/piper/piper}"
PIPER_MODEL="${PIPER_MODEL:-/tmp/piper/en_US-lessac-medium.onnx}"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT
mkdir -p "$OUT_DIR"

if [[ ! -x "$PIPER_BIN" || ! -f "$PIPER_MODEL" ]]; then
  echo "Piper voice missing — bootstrapping…"
  mkdir -p /tmp/piper
  if [[ ! -x /tmp/piper/piper/piper ]]; then
    curl -sL 'https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_amd64.tar.gz' -o /tmp/piper.tgz
    tar -xzf /tmp/piper.tgz -C /tmp/piper
  fi
  if [[ ! -f /tmp/piper/en_US-lessac-medium.onnx ]]; then
    curl -sL 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx' \
      -o /tmp/piper/en_US-lessac-medium.onnx
    curl -sL 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json' \
      -o /tmp/piper/en_US-lessac-medium.onnx.json
  fi
  PIPER_BIN=/tmp/piper/piper/piper
  PIPER_MODEL=/tmp/piper/en_US-lessac-medium.onnx
fi

python3 - <<PY
import subprocess, wave
from pathlib import Path

work = Path("$WORKDIR")
piper = "$PIPER_BIN"
model = "$PIPER_MODEL"

lines = [
    "Hey — this is Quantify. A free trading strategy backtester. No signup, and no API key.",
    "Here on the landing page, you can watch a live demo turn plain English into a real simulation.",
    "Click any strategy chip… and the console reacts right away — typing, parsing, then results.",
    "Or jump into Instant Try. Paste any idea you want, and run a free backtest in seconds.",
    "Browse the playbook for ready-made strategies… or open the workspace and start from scratch.",
    "That’s Quantify. Look-ahead safe fills. Free for everyone. Go try it.",
]

wavs = []
for i, text in enumerate(lines, 1):
    out = work / f"v{i}.wav"
    subprocess.run(
        [piper, "--model", model, "--length_scale", "1.15", "--output_file", str(out)],
        input=text.encode(),
        check=True,
    )
    wavs.append(out)
    print("ok", out.name)

# silence gap
silence = work / "silence.wav"
subprocess.check_call([
    "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", "0.85", str(silence)
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

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
PY

DUR=$(cat "$WORKDIR/duration.txt")
VID_SECS=$(python3 -c "print(max(36, int(float('$DUR') + 6)))")
echo "Recording ${VID_SECS}s of UI (voice ${DUR}s)…"

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
sleep 1.8

run() { DISPLAY="$DISPLAY_NUM" xdotool "$@"; }

# Slow choreography
sleep 3.5
run key --delay 100 Page_Down
sleep 4.0
run key --delay 100 Page_Down
sleep 3.5
run mousemove --sync 420 530 click 1
sleep 4.2
run mousemove --sync 580 530 click 1
sleep 4.2
run mousemove --sync 740 530 click 1
sleep 4.0
run key --delay 110 Page_Down
sleep 3.5
run key --delay 110 Page_Down
sleep 3.2
run mousemove --sync 400 660 click 1
sleep 3.0
run key --delay 70 ctrl+l
sleep 0.5
run type --delay 22 "${URL}playbook"
run key Return
sleep 5.0
run key --delay 70 ctrl+l
sleep 0.5
run type --delay 22 "${URL}app"
run key Return
sleep 5.0
run key --delay 70 ctrl+l
sleep 0.5
run type --delay 22 "$URL"
run key Return
sleep 4.0

wait "$REC_PID" || true

FINAL="$OUT_DIR/$OUT_NAME"
ffmpeg -y -i "$RAW" -i "$WORKDIR/voice.wav" \
  -c:v libx264 -pix_fmt yuv420p -preset fast -crf 19 \
  -c:a aac -b:a 192k -ar 44100 -shortest \
  "$FINAL" >/tmp/demo-mux.log 2>&1

pkill -f 'user-data-dir=/tmp/chrome-project-demo' 2>/dev/null || true
ls -lah "$FINAL"
ffprobe -hide_banner "$FINAL" 2>&1 | head -14
echo "DEMO_READY $FINAL"
