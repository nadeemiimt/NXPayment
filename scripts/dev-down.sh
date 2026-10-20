#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_DIR="$ROOT/.local/dev"
MODE_FILE="$LOCAL_DIR/mode"

kill_tree() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null || true
}

stop_pid_file() {
  local file="$1"
  local label="$2"
  if [[ ! -f "$file" ]]; then
    return 0
  fi
  local pid
  pid="$(tr -d '[:space:]' <"$file" || true)"
  if [[ -n "${pid}" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "Stopping ${label} (pid ${pid})…"
    kill_tree "$pid"
    local i
    for i in $(seq 1 20); do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.25
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill_tree "$pid"
      kill -KILL "$pid" 2>/dev/null || true
    fi
  else
    echo "${label}: not running (stale PID file)"
  fi
  rm -f "$file"
}

mode="node"
if [[ -f "$MODE_FILE" ]]; then
  mode="$(tr -d '[:space:]' <"$MODE_FILE")"
fi

if [[ "$mode" == "docker" ]]; then
  echo "Stopping Docker Compose stack…"
  docker compose -f "$ROOT/deploy/docker-compose.yml" down >/dev/null 2>&1 || true
fi

stop_pid_file "$LOCAL_DIR/api.pid" "api"
stop_pid_file "$LOCAL_DIR/web.pid" "web"
rm -f "$MODE_FILE"

for port in 3847 4321; do
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "Port ${port} still in use (pids: ${pids}) — sending TERM…"
    # shellcheck disable=SC2086
    kill -TERM ${pids} 2>/dev/null || true
    sleep 0.5
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
      # shellcheck disable=SC2086
      kill -KILL ${pids} 2>/dev/null || true
    fi
  fi
done

echo "Local NXPayment services stopped."
