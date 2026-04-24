#!/usr/bin/with-contenv bashio

export FLESPI_TOKEN="$(bashio::config 'flespi_token')"
export TELTONIKA_SMS_LOGIN="$(bashio::config 'teltonika_sms_login')"
export TELTONIKA_SMS_PASSWORD="$(bashio::config 'teltonika_sms_password')"
export SIPGATE_TOKEN_ID="$(bashio::config 'sipgate_token_id')"
export SIPGATE_TOKEN="$(bashio::config 'sipgate_token')"

export PORT=3001
export NODE_ENV=production
export WEB_DIST_DIR=/app/web/dist

exec /app/scripts/start.sh
