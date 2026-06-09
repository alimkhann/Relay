#!/usr/bin/env bash
# Run a local CodeRabbit CLI review scoped to one or more repo directories.
# Usage: ./scripts/coderabbit-cli-scoped.sh <pass-name> <dir> [<dir>...]
set -euo pipefail

PASS_NAME="${1:?pass name required}"
shift
DIRS=("$@")
if ((${#DIRS[@]} == 0)); then
  echo "At least one directory is required" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="${TMPDIR:-/tmp}/relay-coderabbit-cli-${PASS_NAME}-$(date +%Y%m%d-%H%M%S).log"

run_dir_review() {
  local dir="$1"
  echo "=== CodeRabbit CLI pass: ${PASS_NAME} (${dir}) ===" | tee -a "$OUT"
  coderabbit review --plain --base main --type committed --dir "$dir" -c .coderabbit.yaml AGENTS.md 2>&1 | tee -a "$OUT"
}

for dir in "${DIRS[@]}"; do
  if [[ ! -d "$ROOT/$dir" ]]; then
    echo "Missing directory: $dir" >&2
    exit 1
  fi
  run_dir_review "$dir"
done

echo "Saved CLI review log to $OUT"