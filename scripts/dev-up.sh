#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOCAL_DIR="$ROOT/.local/dev"
API_PORT="${API_PORT:-3847}"
WEB_PORT="${WEB_PORT:-4321}"
API_URL="http://127.0.0.1:${API_PORT}"
WEB_URL="http://127.0.0.1:${WEB_PORT}"

mkdir -p "$LOCAL_DIR" "$ROOT/data"

if [[ -f "$LOCAL_DIR/api.pid" ]] || [[ -f "$LOCAL_DIR/web.pid" ]]; then
  echo "Dev processes look like they are already running (PID files in .local/dev/)."
  echo "Run: npm run dev:down"
  echo "Then:  npm run dev:up"
  exit 1
fi

node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [[ "${node_major}" -lt 20 ]]; then
  echo "Node.js 20+ required (current: $(node -v 2>/dev/null || echo missing))."
  echo "Example: nvm use 20"
  exit 1
fi

if [[ ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/deploy/.env.example" "$ROOT/.env"
  echo "Created .env from deploy/.env.example — edit PRIMARY_VPA / secrets as needed."
fi

# API loads .env via dotenv; do not bash-source it (values may contain spaces).
# Override Docker-only DB_PATH for local Node processes.
export DB_PATH="$ROOT/data/nxpayment.sqlite"
export API_PORT="${API_PORT:-3847}"
export API_HOST="${API_HOST:-0.0.0.0}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://127.0.0.1:${API_PORT}}"
API_URL="http://127.0.0.1:${API_PORT}"
WEB_URL="http://127.0.0.1:${WEB_PORT}"

if [[ ! -d "$ROOT/node_modules" ]] || [[ ! -d "$ROOT/apps/web/node_modules" && ! -e "$ROOT/node_modules/next" ]]; then
  echo "Installing workspace dependencies…"
  npm install
fi

echo "Starting API on ${API_URL} …"
npm run dev:api >"$LOCAL_DIR/api.log" 2>&1 &
echo $! >"$LOCAL_DIR/api.pid"

echo "Starting Web on ${WEB_URL} …"
npm run dev:web >"$LOCAL_DIR/web.log" 2>&1 &
echo $! >"$LOCAL_DIR/web.pid"

echo "node" >"$LOCAL_DIR/mode"

wait_http() {
  local url="$1"
  local name="$2"
  local i
  for i in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "${name} ready"
      return 0
    fi
    sleep 0.5
  done
  echo "${name} did not become ready in time. Check ${LOCAL_DIR}/${name}.log"
  return 1
}

if ! wait_http "${API_URL}/health" "api"; then
  "$ROOT/scripts/dev-down.sh" || true
  exit 1
fi

if ! wait_http "${WEB_URL}/" "web"; then
  "$ROOT/scripts/dev-down.sh" || true
  exit 1
fi

cat <<EOF

NXPayment local stack is up (Node)

  API  ${API_URL}
  Web  ${WEB_URL}

  Onboarding  ${WEB_URL}/merchant/onboarding
  Checkout    ${WEB_URL}/checkout
  Pending     ${WEB_URL}/merchant/pending

  Logs  ${LOCAL_DIR}/api.log  ${LOCAL_DIR}/web.log
  Stop  npm run dev:down

EOF
