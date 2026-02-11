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

# --- Toolkit root (where run.py lives, read-only in Nix store) ---
export TOOLKIT_ROOT="${TOOLKIT_ROOT:-${TOOLKIT_PKG}/lib/ai-toolkit}"

# --- Writable data folders (default under DATA_DIR, not the read-only store) ---
export DATASETS_FOLDER="${DATASETS_FOLDER:-${DATA_DIR}/datasets}"
export TRAINING_FOLDER="${TRAINING_FOLDER:-${DATA_DIR}/output}"
export DATA_ROOT="${DATA_ROOT:-${DATA_DIR}/data}"
mkdir -p "$DATASETS_FOLDER" "$TRAINING_FOLDER" "$DATA_ROOT"

# --- Python from ai-toolkit package ---
export PYTHON_PATH="${TOOLKIT_PKG}/bin/ai-toolkit-python"
export PATH="${TOOLKIT_PKG}/bin:$PATH"

# --- Port ---
export PORT="${PORT:-8675}"
# Next.js standalone uses HOSTNAME to bind. The shell's $HOSTNAME is typically
# set to the machine name (which may resolve to a non-local IP), so we must
# override it explicitly. Users can set AI_TOOLKIT_UI_HOST to change the bind address.
export HOSTNAME="${AI_TOOLKIT_UI_HOST:-0.0.0.0}"

# --- Prisma engines for runtime db push ---
export PRISMA_SCHEMA_ENGINE_BINARY="${PRISMA_ENGINES_PKG}/bin/schema-engine"
export PRISMA_QUERY_ENGINE_BINARY="${PRISMA_ENGINES_PKG}/bin/query-engine"
export PRISMA_QUERY_ENGINE_LIBRARY="${PRISMA_ENGINES_PKG}/lib/libquery_engine.node"
export PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

# --- Ensure DB schema is up to date ---
echo "Running prisma db push to ensure schema is up to date..."
if ! node "$UI_DIR/node_modules/prisma/build/index.js" db push --schema "$UI_DIR/prisma/schema.prisma" --skip-generate; then
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
  # Send SIGTERM for graceful shutdown
  kill "$WORKER_PID" "$SERVER_PID" 2>/dev/null || true
  # Give processes up to 3 seconds to exit
  local i=0
  while [ $i -lt 30 ] && (kill -0 "$WORKER_PID" 2>/dev/null || kill -0 "$SERVER_PID" 2>/dev/null); do
    sleep 0.1
    i=$((i + 1))
  done
  # Force kill anything still running
  kill -9 "$WORKER_PID" "$SERVER_PID" 2>/dev/null || true
  wait "$WORKER_PID" "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait for either process to exit
wait -n 2>/dev/null || wait "$SERVER_PID" 2>/dev/null || true
cleanup
