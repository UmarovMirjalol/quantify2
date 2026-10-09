#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMUX_CFG=/exec-daemon/tmux.portal.conf
tmux_cmd() {
  if [ -f "$TMUX_CFG" ]; then tmux -f "$TMUX_CFG" "$@"; else tmux "$@"; fi
}

start_tmux() {
  local name="$1" dir="$2" cmd="$3"
  tmux_cmd has-session -t "=$name" 2>/dev/null || \
    tmux_cmd new-session -d -s "$name" -c "$dir" -- "${SHELL:-bash}" -l
  tmux_cmd send-keys -t "$name:0.0" C-c
  sleep 0.3
  tmux_cmd send-keys -t "$name:0.0" "$cmd" C-m
}

start_tmux quantify-backend "$ROOT/backend" 'export PATH="$HOME/.local/bin:$PATH"; uvicorn app.main:app --host 0.0.0.0 --port 8765 --reload'
start_tmux quantify-frontend "$ROOT/frontend" 'npm run dev -- --host 0.0.0.0 --port 43127'
start_tmux quantify-fe-3000 "$ROOT/frontend" 'npm run dev -- --host 0.0.0.0 --port 3000'

echo "Waiting for servers..."
for _ in $(seq 1 12); do
  if curl -sf -o /dev/null http://127.0.0.1:43127/ && curl -sf -o /dev/null http://127.0.0.1:8765/docs; then
    break
  fi
  sleep 1
done
curl -s -o /dev/null -w "FE43127 %{http_code}\n" http://127.0.0.1:43127/
curl -s -o /dev/null -w "FE3000 %{http_code}\n" http://127.0.0.1:3000/ || true
curl -s -o /dev/null -w "BE %{http_code}\n" http://127.0.0.1:8765/docs
echo "Use Cursor Ports / agent desktop to open http://127.0.0.1:43127/ (or :3000)."
