#!/usr/bin/env bash
set -euo pipefail

UI_DIR="@ui@"
TOOLKIT_PKG="@toolkit@"
PRISMA_ENGINES_PKG="@prismaEngines6@"

# --- Writable data directory ---
DATA_DIR="${AI_TOOLKIT_UI_DATA:-${XDG_DATA_HOME:-$HOME/.local/share}/ai-toolkit}"
mkdir -p "$DATA_DIR"

# --- Database ---
export DATABASE_URL="file:${DATA_DIR}/aitk_db.db"

# --- Toolkit root (where run.py lives) ---
export TOOLKIT_ROOT="${TOOLKIT_ROOT:-${TOOLKIT_PKG}/lib/ai-toolkit}"

# --- Python from ai-toolkit package ---
export PYTHON_PATH="${TOOLKIT_PKG}/bin/ai-toolkit-python"
export PATH="${TOOLKIT_PKG}/bin:$PATH"

# --- Port ---
export PORT="${PORT:-8675}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"

# --- Prisma engines for runtime db push ---
export PRISMA_SCHEMA_ENGINE_BINARY="${PRISMA_ENGINES_PKG}/bin/schema-engine"
export PRISMA_QUERY_ENGINE_BINARY="${PRISMA_ENGINES_PKG}/bin/query-engine"
export PRISMA_QUERY_ENGINE_LIBRARY="${PRISMA_ENGINES_PKG}/lib/libquery_engine.node"
export PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

# --- Ensure DB schema is up to date ---
cd "$UI_DIR"
if ! npx prisma db push --schema ./prisma/schema.prisma --skip-generate 2>&1; then
  echo "Warning: prisma db push failed, DB may need manual setup"
fi

echo ""
echo "AI Toolkit UI starting..."
echo "  Port:         $PORT"
echo "  Data dir:     $DATA_DIR"
echo "  Toolkit root: $TOOLKIT_ROOT"
echo "  UI dir:       $UI_DIR"
echo ""

# --- Start worker and server ---
node "$UI_DIR/dist/cron/worker.js" &
WORKER_PID=$!

node "$UI_DIR/server.js" &
SERVER_PID=$!

cleanup() {
  kill "$WORKER_PID" "$SERVER_PID" 2>/dev/null || true
  wait "$WORKER_PID" "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait for either process to exit
wait -n 2>/dev/null || wait "$SERVER_PID" 2>/dev/null || true
cleanup
