#!/usr/bin/env bash
# Restore the default .coderabbit.yaml after scoped review passes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .coderabbit.yaml.bak ]]; then
  mv .coderabbit.yaml.bak .coderabbit.yaml
else
  cat > .coderabbit.yaml <<'EOF'
# yaml-language-server: $schema=https://coderabbit.ai/integrations/schema.v2.json
language: en-US
enable_free_tier: true
reviews:
  profile: chill
  poem: false
  review_status: true
  path_filters:
    - "!**/*.png"
    - "!**/*.jpg"
    - "!**/*.jpeg"
    - "!**/*.log"
    - "!**/.superpowers/**"
    - "!pnpm-lock.yaml"
    - "!apps/extension/**"
    - "!**/*.test.ts"
    - "!**/*.test.tsx"
    - "!tests/**"
    - "!docs/**"
    - "!apps/web/src/app/(marketing)/**"
    - "!apps/web/src/app/(auth)/**"
    - "!apps/web/src/app/docs/**"
    - "!apps/web/src/app/privacy/**"
    - "!apps/web/src/components/ai-elements/**"
    - "!apps/web/src/components/settings/**"
    - "!apps/web/src/components/ui/**"
    - "!apps/web/src/features/brief/**"
    - "!apps/web/src/app/(workspace)/sources/**"
    - "!apps/web/src/app/(workspace)/chat/**"
    - "!patches/**"
    - "!packages/cli/**"
    - "!apps/web/next-env.d.ts"
    - "!CLAUDE.md"
    - "!DEPLOYMENT.md"
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
EOF
fi

git add .coderabbit.yaml
git commit -m "chore(coderabbit): restore default path filters" || true
git push origin "$(git branch --show-current)" || true
echo "Restored default .coderabbit.yaml"