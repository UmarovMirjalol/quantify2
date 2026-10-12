#!/usr/bin/env bash
# Deploy Quantify with Docker Compose (production).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# Prefer .env.production so local .env (dev) is not overwritten.
ENV_FILE="${ENV_FILE:-}"
if [[ -z "$ENV_FILE" ]]; then
  if [[ -f .env.production ]]; then
    ENV_FILE=".env.production"
  elif [[ -f .env ]]; then
    ENV_FILE=".env"
  else
    ENV_FILE=".env.production"
  fi
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "→ Creating $ENV_FILE from .env.production.example"
  cp .env.production.example "$ENV_FILE"
fi

# Public free mode: keep APP_ACCESS_TOKEN empty (no login gate).
PUBLIC_ACCESS="$(grep -E '^PUBLIC_ACCESS=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]' || true)"
if [[ "$PUBLIC_ACCESS" == "true" || "$PUBLIC_ACCESS" == "1" || "$PUBLIC_ACCESS" == "yes" ]]; then
  if grep -q '^APP_ACCESS_TOKEN=' "$ENV_FILE"; then
    sed -i.bak 's/^APP_ACCESS_TOKEN=.*/APP_ACCESS_TOKEN=/' "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    echo "APP_ACCESS_TOKEN=" >> "$ENV_FILE"
  fi
  echo "→ PUBLIC_ACCESS=true — open free mode (no access gate, built-in parser)."
else
  # Generate access token if missing / placeholder
  if ! grep -q '^APP_ACCESS_TOKEN=.\+' "$ENV_FILE" 2>/dev/null \
    || grep -q '^APP_ACCESS_TOKEN=$' "$ENV_FILE" \
    || grep -q 'APP_ACCESS_TOKEN=change-me' "$ENV_FILE" \
    || grep -q 'APP_ACCESS_TOKEN=REPLACE' "$ENV_FILE"; then
    TOKEN="$(openssl rand -hex 24 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(24))')"
    if grep -q '^APP_ACCESS_TOKEN=' "$ENV_FILE"; then
      sed -i.bak "s/^APP_ACCESS_TOKEN=.*/APP_ACCESS_TOKEN=${TOKEN}/" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
    else
      echo "APP_ACCESS_TOKEN=${TOKEN}" >> "$ENV_FILE"
    fi
    echo "→ Generated APP_ACCESS_TOKEN (this is the key users paste on first visit):"
    echo "   ${TOKEN}"
  fi
fi

# shellcheck disable=SC1091
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export APP_PORT="${APP_PORT:-80}"
export IMAGE_TAG="${IMAGE_TAG:-latest}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-quantify}"

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo docker)
  else
    echo "✗ Docker daemon not reachable. Start Docker, then re-run."
    exit 1
  fi
fi

# Some hosts drop bridge traffic when bridge-nf-call-iptables=1 (edge→backend 504).
if [[ -w /proc/sys/net/bridge/bridge-nf-call-iptables ]]; then
  echo 0 > /proc/sys/net/bridge/bridge-nf-call-iptables 2>/dev/null || true
  echo 0 > /proc/sys/net/bridge/bridge-nf-call-ip6tables 2>/dev/null || true
elif command -v sysctl >/dev/null 2>&1; then
  sysctl -w net.bridge.bridge-nf-call-iptables=0 >/dev/null 2>&1 || \
    sudo -n sysctl -w net.bridge.bridge-nf-call-iptables=0 >/dev/null 2>&1 || true
  sysctl -w net.bridge.bridge-nf-call-ip6tables=0 >/dev/null 2>&1 || \
    sudo -n sysctl -w net.bridge.bridge-nf-call-ip6tables=0 >/dev/null 2>&1 || true
fi

echo "→ Building images (tag=${IMAGE_TAG}, env=${ENV_FILE})"
"${DOCKER[@]}" compose --env-file "$ENV_FILE" build

echo "→ Starting stack on port ${APP_PORT}"
"${DOCKER[@]}" compose --env-file "$ENV_FILE" up -d --remove-orphans

echo "→ Waiting for health…"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    echo
    echo "════════════════════════════════════════════════════════"
    echo "✓ Quantify is live:  http://127.0.0.1:${APP_PORT}"
    echo
    if [[ "$PUBLIC_ACCESS" == "true" || "$PUBLIC_ACCESS" == "1" || "$PUBLIC_ACCESS" == "yes" ]]; then
      echo "PUBLIC FREE MODE — users open the URL and test with no login / no API key."
      echo "Supported free strategies: SMA/EMA cross, RSI, MACD, Bollinger (+ playbook)."
    else
      echo "ACCESS TOKEN (paste this on the first-visit gate):"
      grep '^APP_ACCESS_TOKEN=' "$ENV_FILE" | sed 's/^APP_ACCESS_TOKEN=/  /'
      echo
      echo "Where to find it later:"
      echo "  cat ${ENV_FILE} | grep APP_ACCESS_TOKEN"
    fi
    echo
    echo "LLM key is optional (costs money). Free mode uses FORCE_BUILTIN_PARSER=true."
    echo
    echo "Smoke:"
    echo "  ./deploy/scripts/smoke.sh http://127.0.0.1:${APP_PORT}"
    echo "════════════════════════════════════════════════════════"
    curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" || true
    echo
    "${DOCKER[@]}" compose --env-file "$ENV_FILE" ps
    exit 0
  fi
  sleep 2
done

echo "✗ Health check failed. Recent logs:"
"${DOCKER[@]}" compose --env-file "$ENV_FILE" logs --tail=100
exit 1
