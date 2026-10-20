#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_DIR="$ROOT/.local/dev"

docker compose -f "$ROOT/deploy/docker-compose.yml" down >/dev/null 2>&1 || true
rm -f "$LOCAL_DIR/mode"
echo "Docker Compose stack stopped (or was already down)."
