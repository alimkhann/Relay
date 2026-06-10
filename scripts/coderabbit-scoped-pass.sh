#!/usr/bin/env bash
# Rotate .coderabbit.yaml to a scoped include-only pass, push, and trigger PR review.
# Usage: ./scripts/coderabbit-scoped-pass.sh <pass-name> <include-glob> [<include-glob>...]
set -euo pipefail

PASS_NAME="${1:?pass name required}"
shift
INCLUDES=("$@")
if ((${#INCLUDES[@]} == 0)); then
  echo "At least one include glob is required" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "feat/memory-v2-architecture" ]]; then
  echo "Expected feat/memory-v2-architecture, on $BRANCH" >&2
  exit 1
fi

YAML="$ROOT/.coderabbit.yaml"
BACKUP="$ROOT/.coderabbit.yaml.bak"

cp "$YAML" "$BACKUP"

{
  cat <<'HEADER'
# yaml-language-server: $schema=https://coderabbit.ai/integrations/schema.v2.json
# Scoped pass — restored by scripts/coderabbit-restore-config.sh
language: en-US
enable_free_tier: true
reviews:
  profile: chill
  poem: false
  review_status: true
  path_filters:
HEADER
  for glob in "${INCLUDES[@]}"; do
    printf '    - "%s"\n' "$glob"
  done
  for glob in "**/*.png" "**/*.jpg" "**/*.jpeg" "**/*.log" "**/.superpowers/**" "pnpm-lock.yaml" "**/*.test.ts" "**/*.test.tsx" "tests/**"; do
    printf '    - "!%s"\n' "$glob"
  done
  cat <<'FOOTER'
  auto_review:
    enabled: true
    drafts: false
    base_branches:
      - ".*"
  path_instructions:
    - path: "**/*"
      instructions: |
        Follow AGENTS.md at the repo root. Keep changes small and reviewable.
        This is a pnpm monorepo (apps/web, apps/extension, packages/*).
chat:
  auto_reply: true
FOOTER
} > "$YAML"

git add .coderabbit.yaml
git commit -m "chore(coderabbit): scoped review pass — ${PASS_NAME}"
git push origin "$BRANCH"
gh pr comment 35 --body "@coderabbitai full review — scoped pass: **${PASS_NAME}**"

echo "Triggered scoped pass: ${PASS_NAME}"
echo "Includes: ${INCLUDES[*]}"