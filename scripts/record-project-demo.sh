#!/usr/bin/env bash
# Scripted Quantify product demo → artifacts with voice + subtitles.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-/opt/cursor/artifacts}"
WORKDIR="$(mktemp -d)"
URL="${DEMO_URL:-http://127.0.0.1:18081/}"
DISPLAY_NUM="${DISPLAY:-:1}"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

mkdir -p "$OUT_DIR"

# --- Voice lines ---
cat >"$WORKDIR/lines.txt" <<'EOF'
Welcome to Quantify — free trading strategy backtests, no API key.
Watch the live demo turn plain English into a simulation.
Click any strategy chip — the console reacts instantly.
Open Instant Try, paste any idea, and run a free backtest.
Browse the playbook, or jump straight into the workspace.
Quantify. Look-ahead safe. Free for everyone.
EOF

i=1
while IFS= read -r line; do
  espeak-ng -v en-us -s 145 -a 140 -w "$WORKDIR/v$i.wav" "$line"
  i=$((i + 1))
done <"$WORKDIR/lines.txt"

# Concat voice with short gaps
python3 - <<PY
from pathlib import Path
import wave, struct
work = Path("$WORKDIR")
parts = sorted(work.glob("v*.wav"), key=lambda p: int(p.stem[1:]))
gap_ms = 380
frames = []
params = None
for p in parts:
    with wave.open(str(p), "rb") as w:
        params = w.getparams()
        frames.append(w.readframes(w.getnframes()))
    n = int(params.framerate * gap_ms / 1000)
    frames.append(b"\x00\x00" * n * params.nchannels)
with wave.open(str(work / "voice.wav"), "wb") as out:
    out.setparams(params)
    for f in frames:
        out.writeframes(f)
print("voice ok", work / "voice.wav")
PY

# Subtitles (approx timings matching speech)
cat >"$WORKDIR/demo.srt" <<'EOF'
1
00:00:00,200 --> 00:00:04,200
Welcome to Quantify — free backtests, no API key.

2
00:00:04,500 --> 00:00:08,400
Watch the live demo turn plain English into a simulation.

3
00:00:08,700 --> 00:00:12,600
Click any strategy chip — the console reacts instantly.

4
00:00:12,900 --> 00:00:17,200
Open Instant Try, paste any idea, and run a free backtest.

5
00:00:17,500 --> 00:00:21,400
Browse the playbook, or jump into the workspace.

6
00:00:21,700 --> 00:00:25,800
Quantify. Look-ahead safe. Free for everyone.
EOF

# Launch Chrome
pkill -f 'user-data-dir=/tmp/chrome-project-demo' 2>/dev/null || true
google-chrome --no-sandbox --disable-gpu --window-size=1440,900 \
  --window-position=40,40 \
  --user-data-dir=/tmp/chrome-project-demo \
  "$URL" >/tmp/chrome-project-demo.log 2>&1 &
CHROME_PID=$!
sleep 4

# Focus window
WID=$(DISPLAY="$DISPLAY_NUM" xdotool search --name 'Quantify' | head -1 || true)
if [[ -n "${WID:-}" ]]; then
  DISPLAY="$DISPLAY_NUM" xdotool windowactivate --sync "$WID"
  DISPLAY="$DISPLAY_NUM" xdotool windowmove "$WID" 40 40
  DISPLAY="$DISPLAY_NUM" xdotool windowsize "$WID" 1440 900
fi

# Record screen (X11) for ~26s while driving UI
RAW="$WORKDIR/raw.mp4"
ffmpeg -y -video_size 1440x900 -framerate 30 -f x11grab -i "${DISPLAY_NUM}+40,40" \
  -t 27 -c:v libx264 -pix_fmt yuv420p -preset ultrafast "$RAW" >/tmp/demo-rec.log 2>&1 &
REC_PID=$!
sleep 1.2

# Drive clicks
run_keys() {
  DISPLAY="$DISPLAY_NUM" xdotool "$@"
}

run_keys key --delay 40 Page_Down
sleep 1.4
run_keys key --delay 40 Page_Down
sleep 1.6
# click around demo chips area (approx)
run_keys mousemove --sync 420 520 click 1
sleep 2.2
run_keys mousemove --sync 560 520 click 1
sleep 2.4
run_keys mousemove --sync 720 520 click 1
sleep 2.0
run_keys key --delay 50 Page_Down
sleep 1.8
run_keys key --delay 50 Page_Down
sleep 1.8
# Instant try / CTA area
run_keys mousemove --sync 380 640 click 1
sleep 1.5
run_keys key --delay 40 ctrl+l
sleep 0.3
run_keys type --delay 12 "${URL}playbook"
run_keys key Return
sleep 3.2
run_keys key --delay 40 ctrl+l
sleep 0.3
run_keys type --delay 12 "${URL}app"
run_keys key Return
sleep 3.5
run_keys key --delay 40 ctrl+l
sleep 0.3
run_keys type --delay 12 "$URL"
run_keys key Return
sleep 2.5

wait "$REC_PID" || true

# Mix voice + burn subtitles
FINAL="$OUT_DIR/quantify_product_demo.mp4"
ffmpeg -y -i "$RAW" -i "$WORKDIR/voice.wav" \
  -vf "subtitles=$WORKDIR/demo.srt:force_style='FontName=DejaVu Sans,FontSize=18,PrimaryColour=&H00E8FFF4&,OutlineColour=&H00101010&,BorderStyle=3,Outline=1,Shadow=0,MarginV=36'" \
  -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 \
  -c:a aac -b:a 128k -shortest \
  "$FINAL" >/tmp/demo-mux.log 2>&1

# Lightweight no-voice copy if mux failed
if [[ ! -s "$FINAL" ]]; then
  ffmpeg -y -i "$RAW" -vf "subtitles=$WORKDIR/demo.srt" -c:v libx264 -pix_fmt yuv420p -an "$FINAL"
fi

pkill -f 'user-data-dir=/tmp/chrome-project-demo' 2>/dev/null || true
ls -lah "$FINAL"
echo "DEMO_READY $FINAL"
