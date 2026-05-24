#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# ── env ──────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "⚠  .env not found, creating from env.txt.example"
  cp env.txt.example .env
fi

# ── backend ──────────────────────────────────────────
RELOAD_FLAG=""
[[ "${1:-}" == "--dev" ]] && RELOAD_FLAG="--reload"
.venv/bin/uvicorn backend.app.main:app $RELOAD_FLAG --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "✓ backend started (pid $BACKEND_PID) → http://localhost:8000"

# ── frontend ─────────────────────────────────────────
npm --prefix apps/web run dev -- --hostname 0.0.0.0 --port 3000 &
FRONTEND_PID=$!
echo "✓ frontend started (pid $FRONTEND_PID) → http://localhost:3000"

# ── graceful shutdown ────────────────────────────────
cleanup() {
  echo ""
  echo "shutting down..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  echo "done."
}
trap cleanup EXIT INT TERM

echo ""
echo "YouDub WebUI is running → http://localhost:3000"
echo "Press Ctrl+C to stop."
echo ""

wait
