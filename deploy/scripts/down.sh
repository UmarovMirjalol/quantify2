#!/usr/bin/env bash
# Tear down the production stack (keeps named volumes by default).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" == "--purge" ]]; then
  echo "→ Stopping and removing volumes"
  docker compose down -v --remove-orphans
else
  echo "→ Stopping containers (volumes preserved)"
  docker compose down --remove-orphans
fi
