#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/build/standalone}"
TARGET="${BUN_TARGET:-}"
NAME="${BINARY_NAME:-teltonika-sms}"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/web"

cd "$ROOT"
bun run typecheck
bun run build

compile_args=(build --compile --outfile "$OUT_DIR/$NAME" server/src/index.ts)
if [ -n "$TARGET" ]; then
  compile_args=(build --compile --target "$TARGET" --outfile "$OUT_DIR/$NAME" server/src/index.ts)
fi

bun "${compile_args[@]}"
cp -R "$ROOT/web/dist" "$OUT_DIR/web/dist"

cat > "$OUT_DIR/README.txt" <<'EOF'
Run:
  WEB_DIST_DIR=./web/dist ./teltonika-sms

With an env file from the project root:
  set -a
  . ../../.env
  set +a
  WEB_DIST_DIR=./web/dist ./teltonika-sms

The SQLite database is written to ./data/app.sqlite relative to the current
working directory.
EOF

echo "Standalone release written to $OUT_DIR"
