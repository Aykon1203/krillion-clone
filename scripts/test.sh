#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo "========================================================"
echo "          🌊 KRILLION.IO TEST SUITE RUNNER              "
echo "========================================================"

# Allow passing custom arguments directly to node:test
if [ "$#" -gt 0 ]; then
  echo "Executing node --test with custom arguments: $*"
  exec node --test "$@"
fi

echo "Running unit and integration tests (tests/*.test.mjs)..."
if node --test tests/*.test.mjs; then
  echo ""
  echo "========================================================"
  echo "  ✅ SUCCESS: All unit & integration tests passed!"
  echo "========================================================"
  exit 0
else
  echo ""
  echo "========================================================"
  echo "  ❌ FAILURE: Detected failing tests in test suite."
  echo "========================================================"
  exit 1
fi
