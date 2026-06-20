#!/usr/bin/env bash
#
# Full-offload deploy: whole Next.js app -> Cloudflare Workers via OpenNext.
# Run on branch `chore/opennext-parachute`, from anywhere in the repo, AFTER:
#   1) npx wrangler login            (browser OAuth — only you can do this)
#   2) a production env file exists at apps/web/.vercel/.env.production.local
#      (refresh with:  cd apps/web && npx vercel pull --environment=production )
#
# It pushes every runtime env var as a Worker secret, builds, and deploys.
# It does NOT touch DNS — point www.onrelay.app at the worker separately
# (Workers & Pages -> relay-web -> Settings -> Domains & Routes -> Custom Domain).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/web"

ENV_FILE="${1:-.vercel/.env.production.local}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found." >&2
  echo "Run: cd apps/web && npx vercel pull --environment=production" >&2
  exit 1
fi

# next build reads .env from the project root, not from .vercel/, so load the
# pulled env into the build environment to bake NEXT_PUBLIC_* into the client.
echo "==> Loading build env from $ENV_FILE"
set -a; . "$ENV_FILE"; set +a
# Don't trigger the Vercel-only PostHog sourcemap upload during a Cloudflare build.
unset VERCEL_ENV VERCEL_URL VERCEL

echo "==> Building (OpenNext)"
npx opennextjs-cloudflare build

# Worker must exist before `wrangler secret put`, so deploy first (the app will
# 500 until secrets land — that's fine, no traffic is pointed at it yet).
echo "==> Deploying worker (relay-web) — first pass"
npx wrangler deploy

echo "==> Pushing runtime secrets from $ENV_FILE"
# Skip Vercel/build-system vars and NEXT_PUBLIC_* (inlined at build time, not
# runtime secrets). Everything else becomes a Worker secret.
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"   # strip surrounding double quotes
  case "$key" in
    VERCEL_*|TURBO_*|NX_*|NEXT_PUBLIC_*|CI) continue ;;
  esac
  [[ -z "$key" ]] && continue
  printf '%s' "$val" | npx wrangler secret put "$key" >/dev/null
  echo "    secret set: $key"
done < "$ENV_FILE"

cat <<'NEXT'

==> Deployed. Remaining manual steps:
  1. Smoke-test the *.workers.dev URL printed above:
       - load the homepage
       - sign in (Neon Auth)
       - hit an API route (e.g. /api/viewer) with a real token
       - confirm a DB-backed page (/dashboard) renders
  2. Point the domain: Cloudflare dashboard -> Workers & Pages -> relay-web
     -> Settings -> Domains & Routes -> add Custom Domain `www.onrelay.app`
     (and apex if used). This moves ALL traffic off Vercel.
  3. Rollback if needed: remove the custom domain; DNS falls back to Vercel.
NEXT
