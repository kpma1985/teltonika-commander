#!/usr/bin/with-contenv bashio

export FLESPI_TOKEN="$(bashio::config 'flespi_token')"
export TELTONIKA_SMS_LOGIN="$(bashio::config 'teltonika_sms_login')"
export TELTONIKA_SMS_PASSWORD="$(bashio::config 'teltonika_sms_password')"
export SIPGATE_TOKEN_ID="$(bashio::config 'sipgate_token_id')"
export SIPGATE_TOKEN="$(bashio::config 'sipgate_token')"

export PORT=3001
export NODE_ENV=production
export WEB_DIST_DIR=/app/web/dist

# Pflicht-URLs damit start.sh kein interaktives setup-env.sh aufruft
export FLESPI_BASE_URL=https://flespi.io
export SIPGATE_API_BASE_URL=https://api.sipgate.com/v2
export SIPGATE_OAUTH_BASE_URL=https://login.sipgate.com/auth/realms/third-party/protocol/openid-connect
export SIPGATE_REDIRECT_URI=http://localhost:3001/api/sipgate/callback

exec /app/scripts/start.sh
