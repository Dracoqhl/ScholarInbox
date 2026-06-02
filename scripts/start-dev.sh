#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

export DATABASE_PATH="${DATABASE_PATH:-$ROOT_DIR/data/scholar-inbox.sqlite}"
export BIND_HOST="${BIND_HOST:-172.18.0.1}"
export PORT="${PORT:-3120}"

mkdir -p "$(dirname "$DATABASE_PATH")"

pnpm build
pnpm start --hostname "$BIND_HOST" --port "$PORT"
