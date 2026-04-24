#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"

has_runtime_env() {
  [ -n "${FLESPI_BASE_URL:-}" ] &&
    [ -n "${SIPGATE_API_BASE_URL:-}" ] &&
    [ -n "${SIPGATE_OAUTH_BASE_URL:-}" ] &&
    [ -n "${SIPGATE_REDIRECT_URI:-}" ]
}

if [ ! -f "$ENV_FILE" ] && ! has_runtime_env; then
  "$SCRIPT_DIR/setup-env.sh" --if-missing
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ -f "$ENV_FILE" ]; then
  exec bun --env-file="$ENV_FILE" run "$ROOT/server/src/index.ts"
fi

exec bun run "$ROOT/server/src/index.ts"
