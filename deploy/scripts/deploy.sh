#!/usr/bin/env bash
# Deploy QuantLLM with Docker Compose (production).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

APP_PORT="${APP_PORT:-80}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

if [[ ! -f .env ]]; then
  if [[ -f .env.production.example ]]; then
    echo "→ Creating .env from .env.production.example"
    cp .env.production.example .env
  else
    echo "→ Creating .env from .env.example"
    cp .env.example .env
  fi
  echo "  Edit .env to set LLM_API_KEY / APP_PORT before production use."
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

export APP_PORT IMAGE_TAG

echo "→ Building images (tag=${IMAGE_TAG})"
docker compose build

echo "→ Starting stack on port ${APP_PORT}"
docker compose up -d --remove-orphans

echo "→ Waiting for health…"
for i in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/healthz" >/dev/null 2>&1 \
    || curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    echo "✓ Healthy: http://127.0.0.1:${APP_PORT}"
    curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" || true
    echo
    docker compose ps
    exit 0
  fi
  sleep 2
done

echo "✗ Health check failed. Recent logs:"
docker compose logs --tail=80
exit 1
