#!/usr/bin/env bash
# Tear down the production stack (keeps named volumes by default).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

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

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo docker)
  else
    echo "✗ Docker daemon not reachable."
    exit 1
  fi
fi

COMPOSE=("${DOCKER[@]}" compose)
if [[ -f "$ENV_FILE" ]]; then
  COMPOSE+=(--env-file "$ENV_FILE")
fi

if [[ "${1:-}" == "--purge" ]]; then
  echo "→ Stopping and removing volumes"
  "${COMPOSE[@]}" down -v --remove-orphans
else
  echo "→ Stopping containers (volumes preserved)"
  "${COMPOSE[@]}" down --remove-orphans
fi
