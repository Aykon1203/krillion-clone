#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PORT="${PORT:-${1:-8000}}"

echo "========================================================"
echo "          🌊 STARTING KRILLION.IO LOCAL SERVER          "
echo "========================================================"
echo "📡 Access URL: http://localhost:${PORT}"
echo "📁 Root Dir  : ${REPO_ROOT}"
echo "🛑 Press Ctrl+C to terminate."
echo "========================================================"

exec node scripts/serve.mjs --port "$PORT"
