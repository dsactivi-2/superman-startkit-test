#!/usr/bin/env bash
set -euo pipefail
OUT_DIR="${1:-/opt/ai-supervisor/backups}"
mkdir -p "$OUT_DIR"
TS="$(date +%F_%H%M)"
docker ps --format '{{.Names}}' | grep -E 'db|postgres' >/dev/null || { echo "DB container not found"; exit 1; }
DB_CONT="$(docker ps --format '{{.Names}}' | grep -E 'db|postgres' | head -n1)"
docker exec -t "$DB_CONT" pg_dump -U postgres app > "$OUT_DIR/app_$TS.sql"
echo "Backup written: $OUT_DIR/app_$TS.sql"
