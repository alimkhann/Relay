# Relay Deployment

## Production host

- Vercel project: `relay`
- Production domain: `https://www.onrelay.app`

## Before deploy

```bash
pnpm install
pnpm validate:env
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For Project Sources, apply the latest Neon migrations to a dev branch first and smoke test an upload before production:

```bash
MIGRATION_DATABASE_URL="<neon-dev-unpooled-url>" node scripts/db-admin.js migrate
```

## Deploy to Vercel

```bash
vercel deploy --prod --yes
```

If the repo is not linked locally, log in with `vercel whoami` first and confirm the target project is `relay`.

## Required production environment variables

- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `NEXT_PUBLIC_RELAY_APP_URL`
- `RELAY_INTERNAL_API_SECRET`
- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PRODUCT_ID_PRO_MONTHLY`
- `POLAR_PRODUCT_ID_PRO_ANNUAL`
- `RELAY_SOURCE_ENCRYPTION_KEY`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_REGION`

Project Sources stores encrypted raw files in Cloudflare R2. `RELAY_SOURCE_STORAGE_MODE=memory` is only for local parser/UI tests and must not be used in production. If `RELAY_SOURCE_ENCRYPTION_KEY` is unset, source blob encryption falls back to `RELAY_CONTENT_ENCRYPTION_KEY`.

Neon auth mode also requires:

- `NEON_AUTH_BASE_URL`
- `NEXT_PUBLIC_NEON_AUTH_URL`
- `NEON_AUTH_COOKIE_SECRET`

Local auth mode instead requires:

- `LOCAL_AUTH_SESSION_SECRET`

## Important note on app URLs

Some current auth/token flows still read `NEXT_PUBLIC_APP_URL` while most of the app reads `NEXT_PUBLIC_RELAY_APP_URL`.
Set both to the same production origin until the legacy name is fully removed.

## Internal drain job

Relay currently exposes `POST /api/internal/jobs/drain` for digest draining.
Production still needs a scheduler to invoke it with `RELAY_INTERNAL_API_SECRET`.

Recommended options:

- Vercel Cron calling a small internal route wrapper
- GitHub Actions scheduled workflow with a protected secret
- External scheduler hitting the endpoint over HTTPS
