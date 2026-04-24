#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"

usage() {
  cat <<'EOF'
Usage: scripts/setup-env.sh [--if-missing] [--force]

Creates the root .env file by asking for every supported variable.

Options:
  --if-missing  Exit without changes when .env already exists.
  --force       Overwrite an existing .env.
EOF
}

if_missing=false
force=false

while [ $# -gt 0 ]; do
  case "$1" in
    --if-missing) if_missing=true ;;
    --force) force=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [ -f "$ENV_FILE" ] && [ "$force" != true ]; then
  if [ "$if_missing" = true ]; then
    exit 0
  fi
  echo "$ENV_FILE already exists. Use --force to overwrite it." >&2
  exit 1
fi

if [ ! -t 0 ]; then
  echo "Cannot create $ENV_FILE interactively because stdin is not a TTY." >&2
  exit 1
fi

ask() {
  local key="$1"
  local prompt="$2"
  local default="${3:-}"
  local secret="${4:-false}"
  local value

  if [ "$secret" = true ]; then
    if [ -n "$default" ]; then
      read -r -s -p "$prompt [$default]: " value
    else
      read -r -s -p "$prompt: " value
    fi
    echo
  else
    if [ -n "$default" ]; then
      read -r -p "$prompt [$default]: " value
    else
      read -r -p "$prompt: " value
    fi
  fi

  if [ -z "$value" ]; then
    value="$default"
  fi

  printf -v "$key" '%s' "$value"
}

env_line() {
  local key="$1"
  local value="$2"
  value="${value//\'/\'\\\'\'}"
  printf "%s='%s'\n" "$key" "$value"
}

echo "Creating $ENV_FILE"
echo "Press Enter to accept defaults. Optional credentials can stay empty."
echo

ask FLESPI_TOKEN "Flespi token" "" true
ask FLESPI_BASE_URL "Flespi base URL" "https://flespi.io"

ask SIPGATE_SMS_ID "Sipgate SMS ID" "s0"
ask SIPGATE_API_BASE_URL "Sipgate API base URL" "https://api.sipgate.com/v2"
ask SIPGATE_OAUTH_BASE_URL "Sipgate OAuth base URL" "https://login.sipgate.com/auth/realms/third-party/protocol/openid-connect"

ask SIPGATE_CLIENT_ID "Sipgate OAuth client ID" ""
ask SIPGATE_CLIENT_SECRET "Sipgate OAuth client secret" "" true
ask SIPGATE_REDIRECT_URI "Sipgate OAuth redirect URI" "http://localhost:3001/api/sipgate/callback"

ask SIPGATE_TOKEN_ID "Sipgate PAT token ID" ""
ask SIPGATE_TOKEN "Sipgate PAT token" "" true

ask TELTONIKA_SMS_LOGIN "Teltonika SMS login" ""
ask TELTONIKA_SMS_PASSWORD "Teltonika SMS password" "" true
ask BLUETOOTH_PASSWORD "Teltonika Bluetooth configurator password" "" true

ask PORT "Server port" "3001"
ask DOCKER_LISTEN_PORT "Docker Compose listen port on host" "$PORT"
ask WEB_DIST_DIR "Static web/dist override (leave empty normally)" ""

ask VITE_API_PROXY_TARGET "Vite API proxy target" "http://localhost:3001"
ask VITE_FLESPI_TOKEN_HELP_URL "Flespi token help URL" "https://flespi.com/kb/tokens-access-keys-to-flespi-platform"
ask VITE_SIPGATE_API_CLIENTS_URL "Sipgate API clients URL" "https://app.sipgate.com/api-clients"
ask VITE_SIPGATE_PAT_URL "Sipgate PAT URL" "https://app.sipgate.com/w0/personal-access-token"
ask VITE_OPENSTREETMAP_URL "OpenStreetMap base URL" "https://www.openstreetmap.org"
ask VITE_GOOGLE_MAPS_URL "Google Maps base URL" "https://www.google.com/maps"

tmp_file="$(mktemp)"
{
cat <<'EOF'
# Flespi
EOF
env_line FLESPI_TOKEN "$FLESPI_TOKEN"
env_line FLESPI_BASE_URL "$FLESPI_BASE_URL"

cat <<'EOF'
# Sipgate
EOF
env_line SIPGATE_SMS_ID "$SIPGATE_SMS_ID"
env_line SIPGATE_API_BASE_URL "$SIPGATE_API_BASE_URL"
env_line SIPGATE_OAUTH_BASE_URL "$SIPGATE_OAUTH_BASE_URL"
env_line SIPGATE_CLIENT_ID "$SIPGATE_CLIENT_ID"
env_line SIPGATE_CLIENT_SECRET "$SIPGATE_CLIENT_SECRET"
env_line SIPGATE_REDIRECT_URI "$SIPGATE_REDIRECT_URI"
env_line SIPGATE_TOKEN_ID "$SIPGATE_TOKEN_ID"
env_line SIPGATE_TOKEN "$SIPGATE_TOKEN"

cat <<'EOF'
# Teltonika
EOF
env_line TELTONIKA_SMS_LOGIN "$TELTONIKA_SMS_LOGIN"
env_line TELTONIKA_SMS_PASSWORD "$TELTONIKA_SMS_PASSWORD"
env_line BLUETOOTH_PASSWORD "$BLUETOOTH_PASSWORD"

cat <<'EOF'
# Server
EOF
env_line PORT "$PORT"
env_line DOCKER_LISTEN_PORT "$DOCKER_LISTEN_PORT"
env_line WEB_DIST_DIR "$WEB_DIST_DIR"

cat <<'EOF'
# Frontend / dev proxy / public links (Vite, build-time)
EOF
env_line VITE_API_PROXY_TARGET "$VITE_API_PROXY_TARGET"
env_line VITE_FLESPI_TOKEN_HELP_URL "$VITE_FLESPI_TOKEN_HELP_URL"
env_line VITE_SIPGATE_API_CLIENTS_URL "$VITE_SIPGATE_API_CLIENTS_URL"
env_line VITE_SIPGATE_PAT_URL "$VITE_SIPGATE_PAT_URL"
env_line VITE_OPENSTREETMAP_URL "$VITE_OPENSTREETMAP_URL"
env_line VITE_GOOGLE_MAPS_URL "$VITE_GOOGLE_MAPS_URL"
} > "$tmp_file"

mv "$tmp_file" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo
echo "Created $ENV_FILE"
