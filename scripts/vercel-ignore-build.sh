#!/bin/bash
# Vercel Ignored Build Step — only build when web app or its dependencies change.
# Set this in Vercel Project Settings → Git → Ignored Build Step:
#   bash scripts/vercel-ignore-build.sh
#
# Exit 1 = proceed with build, Exit 0 = skip build.

echo "Checking for changes in apps/web and shared packages..."

cd ../.. || exit 1

# Compare HEAD against the previous successful deployment commit.
# VERCEL_GIT_PREVIOUS_SHA is set by Vercel; fall back to HEAD~1.
BASE="${VERCEL_GIT_PREVIOUS_SHA:-HEAD~1}"

# If BASE is empty or the commit isn't available (shallow clone), always build.
if [ -z "$BASE" ]; then
  echo "No base SHA available. Proceeding with build."
  exit 1
fi

if ! git cat-file -e "$BASE" 2>/dev/null; then
  echo "Base commit $BASE not available (shallow clone?). Proceeding with build."
  exit 1
fi

CHANGED=$(git diff --name-only "$BASE" HEAD -- \
  apps/web \
  packages/shared \
  packages/db \
  packages/adapters \
  packages/formatters \
  vercel.json \
  pnpm-lock.yaml \
  package.json \
  tsconfig.json)

if [ -n "$CHANGED" ]; then
  echo "Changes detected:"
  echo "$CHANGED"
  echo "→ Proceeding with build."
  exit 1
else
  echo "No relevant changes. Skipping build."
  exit 0
fi
