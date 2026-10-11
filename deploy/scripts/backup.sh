#!/usr/bin/env bash
# Backup SQLite DB + uploads from Docker volumes.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${1:-$ROOT/backups/quantify-${STAMP}}"
mkdir -p "$OUT"

echo "→ Backing up to $OUT"
docker compose exec -T backend python - <<'PY' >"$OUT/backtests.db" || true
import shutil
from pathlib import Path
src = Path("/data/backtests.db")
if src.exists():
    import sys
    sys.stdout.buffer.write(src.read_bytes())
PY

# Prefer docker volume copy for reliability
CID="$(docker compose ps -q backend)"
if [[ -n "$CID" ]]; then
  docker cp "$CID:/data/backtests.db" "$OUT/backtests.db" 2>/dev/null || true
  docker cp "$CID:/app/uploads" "$OUT/uploads" 2>/dev/null || mkdir -p "$OUT/uploads"
fi

tar -C "$OUT" -czf "${OUT}.tar.gz" . 2>/dev/null || true
echo "✓ Backup ready: ${OUT}.tar.gz"
ls -lah "$OUT" "${OUT}.tar.gz" 2>/dev/null || ls -lah "$OUT"
