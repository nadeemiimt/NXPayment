#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/dev-down.sh"
"$ROOT/scripts/dev-up.sh"
