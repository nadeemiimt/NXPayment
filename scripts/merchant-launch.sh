#!/usr/bin/env bash
# Start API+Web and open Tokens UI (Mac/Linux). No secrets bundled.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_PORT="${API_PORT:-3847}"
WEB_PORT="${WEB_PORT:-4321}"
TOKENS_URL="http://127.0.0.1:${WEB_PORT}/merchant/tokens"

if [[ ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/deploy/.env.example" "$ROOT/.env"
  echo "Created .env from deploy/.env.example"
fi

mkdir -p "$ROOT/.local" "$ROOT/data"

# Start stack if not already up
if ! curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
  npm run dev:up
fi

FIRST_RUN=0
if [[ ! -f "$ROOT/.local/first-run-done" ]]; then
  FIRST_RUN=1
  date -u +"%Y-%m-%dT%H:%M:%SZ" >"$ROOT/.local/first-run-done"
fi

OPEN_URL="$TOKENS_URL"
if [[ "$FIRST_RUN" -eq 0 ]]; then
  OPEN_URL="http://127.0.0.1:${WEB_PORT}/merchant"
fi

if command -v open >/dev/null 2>&1; then
  open "$OPEN_URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$OPEN_URL"
else
  echo "Open: $OPEN_URL"
fi
