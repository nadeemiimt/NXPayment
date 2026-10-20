#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOCAL_DIR="$ROOT/.local/dev"
mkdir -p "$LOCAL_DIR"

if [[ ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/deploy/.env.example" "$ROOT/.env"
  echo "Created .env from deploy/.env.example — edit PRIMARY_VPA / secrets as needed."
fi

if [[ -f "$LOCAL_DIR/api.pid" ]] || [[ -f "$LOCAL_DIR/web.pid" ]]; then
  echo "Node dev PIDs exist. Run npm run dev:down first."
  exit 1
fi

API_PORT="${API_PORT:-3847}"
WEB_PORT="${WEB_PORT:-4321}"

echo "Starting Docker Compose (deploy/docker-compose.yml)…"
docker compose -f deploy/docker-compose.yml --env-file .env up -d --build

echo "docker" >"$LOCAL_DIR/mode"

API_URL="http://127.0.0.1:${API_PORT}"
WEB_URL="http://127.0.0.1:${WEB_PORT}"

for i in $(seq 1 90); do
  if curl -fsS "${API_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

cat <<EOF

NXPayment local stack is up (Docker)

  API  ${API_URL}
  Web  ${WEB_URL}

  Stop  npm run dev:down:docker
     or npm run dev:down

EOF
