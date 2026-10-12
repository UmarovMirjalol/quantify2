#!/usr/bin/env bash
# Quantify product demo — Kokoro human voice, Chrome kiosk (no browser UI), no subtitles.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-/opt/cursor/artifacts}"
WORKDIR="$(mktemp -d)"
URL="${DEMO_URL:-http://127.0.0.1:18081/}"
# Normalize trailing slash for route joins
URL_BASE="${URL%/}"
DISPLAY_NUM="${DISPLAY:-:1}"
OUT_NAME="${DEMO_OUT:-quantify_product_demo_human.mp4}"
KOKORO_MODEL="${KOKORO_MODEL:-/tmp/kokoro/kokoro-v1.0.onnx}"
KOKORO_VOICES="${KOKORO_VOICES:-/tmp/kokoro/voices-v1.0.bin}"
# am_michael = warm American male; closest to a real person among bundled voices
KOKORO_VOICE="${KOKORO_VOICE:-am_michael}"
CDP_PORT="${CDP_PORT:-9223}"
# Capture full Xvfb framebuffer (kiosk fills it — zero Chrome chrome)
W="${DEMO_W:-1920}"
H="${DEMO_H:-1200}"
PANEL_WAS_RUNNING=0

cleanup() {
  pkill -f "user-data-dir=/tmp/chrome-project-demo" 2>/dev/null || true
  # Restore desktop panel if we hid it
  if [[ "$PANEL_WAS_RUNNING" -eq 1 ]] && ! pgrep -x xfce4-panel >/dev/null; then
    DISPLAY="$DISPLAY_NUM" xfce4-panel >/dev/null 2>&1 &
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT
mkdir -p "$OUT_DIR"

# Hide XFCE panel (clock / tray) so it never overlays the kiosk frame
if pgrep -x xfce4-panel >/dev/null; then
  PANEL_WAS_RUNNING=1
  DISPLAY="$DISPLAY_NUM" xfce4-panel -q 2>/dev/null || killall xfce4-panel 2>/dev/null || true
  sleep 0.5
fi

# Managed policy: no update / promo bubbles
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
else
  mkdir -p /tmp/chrome-policies/managed
  printf '%s\n' "$POLICY_JSON" > /tmp/chrome-policies/managed/quantify-demo.json
fi

if [[ ! -f "$KOKORO_MODEL" || ! -f "$KOKORO_VOICES" ]]; then
  echo "Kokoro models missing — bootstrapping…"
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
    # Slightly slow for natural pacing
    samples, sample_rate = kokoro.create(text, voice=voice_name, speed=0.86)
    sf.write(str(out), samples, sample_rate)
    wavs.append(out)
    print("ok", out.name, f"{len(samples)/sample_rate:.1f}s")

with sf.SoundFile(str(wavs[0])) as f:
    sr = f.samplerate

silence = work / "silence.wav"
sf.write(str(silence), np.zeros(int(sr * 1.05), dtype=np.float32), sr)

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
VID_SECS=$(python3 -c "print(max(42, int(float('$DUR') + 8)))")
echo "Recording ${VID_SECS}s kiosk UI (voice ${DUR}s, ${KOKORO_VOICE})…"

pkill -f 'user-data-dir=/tmp/chrome-project-demo' 2>/dev/null || true
sleep 0.6
rm -rf /tmp/chrome-project-demo
mkdir -p /tmp/chrome-project-demo/Default

# Prefs: no welcome, no default-browser nag, no notification prompts
cat > /tmp/chrome-project-demo/Default/Preferences <<'JSON'
{
  "browser": {
    "check_default_browser": false,
    "has_seen_welcome_page": true
  },
  "distribution": {
    "skip_first_run_ui": true,
    "show_welcome_page": false
  },
  "profile": {
    "default_content_setting_values": { "notifications": 2 }
  }
}
JSON

# True kiosk = no tabs, omnibox, title bar. Extra flags kill update / promo chrome.
google-chrome \
  --no-sandbox \
  --disable-gpu \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI,ChromeWhatsNewUI,InfiniteSessionRestore \
  --check-for-update-interval=31536000 \
  --disable-component-update \
  --disable-background-networking \
  --disable-client-side-phishing-detection \
  --disable-default-apps \
  --disable-sync \
  --disable-extensions \
  --no-first-run \
  --no-default-browser-check \
  --remote-debugging-port="$CDP_PORT" \
  --user-data-dir=/tmp/chrome-project-demo \
  --kiosk "${URL_BASE}/" \
  >/tmp/chrome-project-demo.log 2>&1 &

# Wait for CDP
for i in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${CDP_PORT}/json" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
sleep 2.0

# Kill any leftover Chrome dialogs (update / restore / etc.)
DISPLAY="$DISPLAY_NUM" xdotool search --name "Can't update" 2>/dev/null | while read -r wid; do
  DISPLAY="$DISPLAY_NUM" xdotool windowkill "$wid" 2>/dev/null || true
done
DISPLAY="$DISPLAY_NUM" xdotool search --name "update Chrome" 2>/dev/null | while read -r wid; do
  DISPLAY="$DISPLAY_NUM" xdotool windowkill "$wid" 2>/dev/null || true
done
sleep 0.5

cdp_navigate() {
  local target="$1"
  python3 - <<PY
import json, time, urllib.request
import websocket
base = "http://127.0.0.1:${CDP_PORT}"
tabs = json.load(urllib.request.urlopen(base + "/json"))
page = next(t for t in tabs if t.get("type") == "page")
ws = websocket.create_connection(page["webSocketDebuggerUrl"], suppress_origin=True)
mid = 1
def send(method, params=None):
    global mid
    payload = {"id": mid, "method": method}
    if params:
        payload["params"] = params
    ws.send(json.dumps(payload))
    this_id = mid
    mid += 1
    while True:
        resp = json.loads(ws.recv())
        if resp.get("id") == this_id:
            return resp
send("Page.enable")
send("Page.navigate", {"url": "$target"})
time.sleep(0.4)
ws.close()
PY
}

RAW="$WORKDIR/raw.mp4"
ffmpeg -y -video_size "${W}x${H}" -framerate 30 -f x11grab -i "${DISPLAY_NUM}+0,0" \
  -t "$VID_SECS" -c:v libx264 -pix_fmt yuv420p -preset ultrafast "$RAW" \
  >/tmp/demo-rec.log 2>&1 &
REC_PID=$!
sleep 2.0

run() { DISPLAY="$DISPLAY_NUM" xdotool "$@"; }

# Slow choreography on landing
sleep 4.5
run key --delay 140 Page_Down
sleep 5.0
run key --delay 140 Page_Down
sleep 4.5
# Strategy chips (approx mid landing on 1920x1200)
run mousemove --sync 560 620 click 1
sleep 5.0
run mousemove --sync 780 620 click 1
sleep 5.0
run mousemove --sync 1000 620 click 1
sleep 5.0
run key --delay 140 Page_Down
sleep 4.5
run key --delay 140 Page_Down
sleep 4.0
# Instant Try CTA area
run mousemove --sync 520 780 click 1
sleep 4.0

# In-app routes via CDP — no omnibox, no Chrome chrome
cdp_navigate "${URL_BASE}/playbook"
sleep 6.0
cdp_navigate "${URL_BASE}/app"
sleep 6.0
cdp_navigate "${URL_BASE}/"
sleep 4.5

wait "$REC_PID" || true

FINAL="$OUT_DIR/$OUT_NAME"
ffmpeg -y -i "$RAW" -i "$WORKDIR/voice.wav" \
  -c:v libx264 -pix_fmt yuv420p -preset fast -crf 19 \
  -c:a aac -b:a 192k -ar 44100 -shortest \
  "$FINAL" >/tmp/demo-mux.log 2>&1

ls -lah "$FINAL"
ffprobe -hide_banner "$FINAL" 2>&1 | head -16
echo "DEMO_READY $FINAL"
