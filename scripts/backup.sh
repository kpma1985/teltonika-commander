#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$ROOT_DIR/backups"
OUT_FILE="$OUT_DIR/teltonika-sms-backup-$STAMP.tar.gz"

mkdir -p "$OUT_DIR"

tar \
  --exclude='./backups' \
  --exclude='./node_modules' \
  --exclude='./server/node_modules' \
  --exclude='./web/node_modules' \
  --exclude='./web/dist' \
  --exclude='./server/data/*.sqlite-shm' \
  --exclude='./server/data/*.sqlite-wal' \
  -czf "$OUT_FILE" .

printf '%s\n' "$OUT_FILE"
