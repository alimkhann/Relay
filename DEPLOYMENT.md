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

## Memory v2 — cost-safe async pipeline

Memory writes enqueue durable `memory_pipeline_jobs` and opportunistically drain a
tiny bounded batch. The existing daily `/api/internal/jobs/cron` is the recovery
backstop and processes only queued jobs plus projects marked due for hygiene.

`/api/cron/memory-pipeline` is manual/operator-only. Do not schedule it at a fixed
cadence: frequent wakeups prevent Neon scale-to-zero.

Required env / secrets:

| Where | Name | Notes |
|---|---|---|
| Vercel env | `CRON_SECRET` | Required in production. Cron returns 401 without `Authorization: Bearer <secret>`. |
| Vercel env | `WORKER_DATABASE_URL` | Optional. Connection string used by the cron route only. Falls back to `DATABASE_URL` when unset. Point at `relay_worker` once that role is provisioned. |
| Vercel env | `RELAY_MEMORY_PIPELINE_FULL` | `true` → Gemini extractors run. Default `false` (embed-only). Flip after a quality soak. |
| Vercel env | `RELAY_HYGIENE_DRY_RUN` | `true` (default) logs proposed transitions; `false` writes. |
| Vercel env | `RELAY_PIPELINE_DAILY_USD_CAP` | Default `5`. In-process circuit-breaker on extractor spend per UTC day. |
| Vercel env | `RELAY_EMBED_CANONICAL_ENTITIES` | Default `false`. Opt-in vectors for newly created canonical entities only. |
| Vercel env | `RELAY_PERSONAL_MEMORY_ITEM_CAP` | Default `500`. Archives oldest non-pinned personal overflow. |

### Worker role provisioning (optional, future hardening)

`docs/memory-v2/roles.sql` contains the idempotent SQL block that creates
`relay_worker` + grants. Apply per Neon branch via the Neon SQL editor or
`mcp__Neon__run_sql`, then point `WORKER_DATABASE_URL` at the new role.
Today the app still connects as `neondb_owner` (RLS is decorative for the
app conn — see Memory v2 HANDOFF "Risks"); moving the app to a non-owner
role is a separate hardening PR.
