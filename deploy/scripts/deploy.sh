#!/usr/bin/env bash
# Deploy QuantLLM with Docker Compose (production).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

APP_PORT="${APP_PORT:-80}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

if [[ ! -f .env ]]; then
  echo "→ Creating .env from .env.production.example"
  cp .env.production.example .env
fi

# Generate access token if missing / placeholder
if ! grep -q '^APP_ACCESS_TOKEN=.\+' .env 2>/dev/null \
  || grep -q '^APP_ACCESS_TOKEN=$' .env \
  || grep -q 'APP_ACCESS_TOKEN=change-me' .env \
  || grep -q 'APP_ACCESS_TOKEN=REPLACE' .env; then
  TOKEN="$(openssl rand -hex 24 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(24))')"
  if grep -q '^APP_ACCESS_TOKEN=' .env; then
    sed -i.bak "s/^APP_ACCESS_TOKEN=.*/APP_ACCESS_TOKEN=${TOKEN}/" .env && rm -f .env.bak
  else
    echo "APP_ACCESS_TOKEN=${TOKEN}" >> .env
  fi
  echo "→ Generated APP_ACCESS_TOKEN (share this with your users):"
  echo "   ${TOKEN}"
fi

# shellcheck disable=SC1091
set -a
# shellcheck disable=SC1090
source .env
set +a

export APP_PORT="${APP_PORT:-80}"
export IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "→ Building images (tag=${IMAGE_TAG})"
docker compose build

echo "→ Starting stack on port ${APP_PORT}"
docker compose up -d --remove-orphans

echo "→ Waiting for health…"
for i in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    echo "✓ Healthy: http://127.0.0.1:${APP_PORT}"
    curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" || true
    echo
    echo "Users open the URL and enter APP_ACCESS_TOKEN from .env when prompted."
    grep '^APP_ACCESS_TOKEN=' .env | sed 's/^/  /'
    docker compose ps
    exit 0
  fi
  sleep 2
done

echo "✗ Health check failed. Recent logs:"
docker compose logs --tail=80
exit 1
