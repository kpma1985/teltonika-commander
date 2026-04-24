#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
SERVER_DIR="$ROOT/server"
WEB_DIR="$ROOT/web"
LOG_SERVER="$ROOT/.log-server.log"
LOG_WEB="$ROOT/.log-web.log"

BACKEND_PORT=3001
FRONTEND_PORT=5173

find_backend_pid() {
  pgrep -f "bun.*src/index.ts" 2>/dev/null | head -1 || true
}

find_frontend_pid() {
  pgrep -f "vite" 2>/dev/null | head -1 || true
}

kill_port() {
  local port=$1
  lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | xargs kill -9 2>/dev/null || true
}

find_frontend_port() {
  lsof -iTCP -sTCP:LISTEN -a -p "$(find_frontend_pid)" 2>/dev/null | awk 'NR==2{gsub(/.*:/,"",$9); print $9}' || echo "$FRONTEND_PORT"
}

wait_port() {
  local port=$1 label=$2 tries=0
  while ! lsof -iTCP:"$port" -sTCP:LISTEN -t &>/dev/null; do
    sleep 0.5
    tries=$((tries+1))
    if [ $tries -ge 20 ]; then
      echo "FEHLER: $label antwortet nicht auf Port $port"
      return 1
    fi
  done
}

cmd="${1:-}"

case "$cmd" in
  start)
    "$ROOT/scripts/setup-env.sh" --if-missing

    # Backend
    kill_port $BACKEND_PORT
    pkill -f "bun.*src/index.ts" 2>/dev/null || true
    pkill -f "bt_worker" 2>/dev/null || true
    sleep 0.5
    echo "Starte Backend..."
    cd "$SERVER_DIR"
    nohup bun --env-file=../.env run src/index.ts >> "$LOG_SERVER" 2>&1 &
    wait_port $BACKEND_PORT "Backend"
    echo "Backend  gestartet      (PID $(find_backend_pid), Port $BACKEND_PORT)"

    # Frontend
    # Frontend
    kill_port $FRONTEND_PORT
    pkill -f "vite" 2>/dev/null || true
    sleep 0.5
    echo "Starte Frontend..."
    cd "$WEB_DIR"
    nohup bun run dev >> "$LOG_WEB" 2>&1 &
    wait_port $FRONTEND_PORT "Frontend" || true
    sleep 1
    actual_port=$(find_frontend_port)
    echo "Frontend gestartet      (PID $(find_frontend_pid), Port $actual_port)"

    echo ""
    echo "App erreichbar unter: http://localhost:$(find_frontend_port)"
    ;;

  stop)
    pkill -f "bun.*src/index.ts" 2>/dev/null && echo "Backend  gestoppt" || echo "Backend  war nicht aktiv"
    pkill -f "vite" 2>/dev/null && echo "Frontend gestoppt" || echo "Frontend war nicht aktiv"
    pkill -f "bt_worker" 2>/dev/null || true
    kill_port $BACKEND_PORT
    kill_port $FRONTEND_PORT
    sleep 1
    ;;

  restart)
    "$0" stop
    sleep 1
    "$0" start
    ;;

  status)
    if pid=$(find_backend_pid); [ -n "$pid" ]; then
      echo "Backend  läuft  (PID $pid, Port $BACKEND_PORT)"
    else
      echo "Backend  gestoppt"
    fi
    if pid=$(find_frontend_pid); [ -n "$pid" ]; then
      echo "Frontend läuft  (PID $pid, Port $(find_frontend_port))"
    else
      echo "Frontend gestoppt"
    fi
    ;;

  log)
    target="${2:-all}"
    case "$target" in
      server|backend)  tail -f "$LOG_SERVER" ;;
      web|frontend)    tail -f "$LOG_WEB" ;;
      *)
        echo "=== Backend ===" && tail -20 "$LOG_SERVER"
        echo "=== Frontend ===" && tail -20 "$LOG_WEB"
        ;;
    esac
    ;;

  *)
    echo "Usage: $0 {start|stop|restart|status|log [server|web]}"
    exit 1
    ;;
esac
