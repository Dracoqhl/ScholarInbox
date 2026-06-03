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
export BIND_HOST="${BIND_HOST:-0.0.0.0}"
export PORT="${PORT:-3120}"

mkdir -p "$(dirname "$DATABASE_PATH")"

SERVER_PID=""
SCHEDULER_PID=""

cleanup() {
  trap - EXIT INT TERM
  if [ -n "$SCHEDULER_PID" ] && kill -0 "$SCHEDULER_PID" 2>/dev/null; then
    kill "$SCHEDULER_PID" 2>/dev/null || true
    wait "$SCHEDULER_PID" 2>/dev/null || true
  fi
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

pnpm build
pnpm start --hostname "$BIND_HOST" --port "$PORT" &
SERVER_PID=$!
node scripts/daily-crawl-scheduler.mjs &
SCHEDULER_PID=$!
wait "$SERVER_PID"
