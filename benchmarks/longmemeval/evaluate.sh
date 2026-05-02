#!/usr/bin/env bash
# Runs LongMemEval's official evaluate_qa.py against our hypotheses.jsonl.
# Requires: OPENAI_API_KEY in env, python3 with `openai` package.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE="$HERE/.cache"
DATA="$HERE/data"
HYPOS="${HYPOTHESES_PATH:-$DATA/hypotheses.jsonl}"
DATASET="${DATASET_PATH:-$DATA/longmemeval_oracle.json}"

if [[ ! -f "$HYPOS" ]]; then
  echo "hypotheses.jsonl not found — run the harness first" >&2
  exit 1
fi
if [[ ! -f "$DATASET" ]]; then
  echo "dataset not found at $DATASET" >&2
  exit 1
fi

if [[ ! -d "$CACHE/LongMemEval" ]]; then
  mkdir -p "$CACHE"
  git clone --depth 1 https://github.com/xiaowu0162/LongMemEval.git "$CACHE/LongMemEval"
fi

# evaluate_qa.py lives in src/evaluation. It expects hypothesis + reference paths.
cd "$CACHE/LongMemEval/src/evaluation"

# Load OPENAI_API_KEY from harness .env if not already set
if [[ -z "${OPENAI_API_KEY:-}" && -f "$HERE/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$HERE/.env"
  set +a
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY not set" >&2
  exit 1
fi

python3 evaluate_qa.py gpt-4o "$HYPOS" "$DATASET"
