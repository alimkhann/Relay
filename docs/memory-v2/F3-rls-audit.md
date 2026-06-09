# F3 — App-role RLS Swap Audit

Goal: move the app's `DATABASE_URL` off `neondb_owner` (which has
`rolbypassrls=true`) onto a least-privilege `relay_app` role so the RLS
policies shipped in PR #35 actually bind at runtime. Today they are
decorative for the prod connection.

## Why now (not "after cutover stabilizes")

- Prod is live. Every PR #35 policy (`is_project_member`, `is_space_member`,
  dual-path) is bypassed by the owner role. A single bug like
  `SELECT * FROM memory_items WHERE project_id = $1` with attacker-controlled
  `$1` leaks cross-tenant memory.
- We just doubled the surface area (spaces, observations, entity_relations,
  hygiene transitions). The blast radius of a missed-scope bug grew with the
  schema.
- F3 is one of the cheapest defense-in-depth items we can ship before the
  end-of-March public launch.

## The audit (24 no-viewer call sites — `createRepositoryBundle()` / `createRepositoryProvider()`)

Grouped by the pattern they need under a non-bypassrls role.

### Group A — Pre-auth flows (no viewer GUC yet, by design)

These run BEFORE the user has a session token, so they can't set
`relay.current_user_id`. They write/read mostly into `profiles`,
`pending_auth_*`, `email_otp`, `cli_auth_*` tables that don't have
project/space scope.

- `apps/web/src/app/api/auth/email-otp/route.ts`
- `apps/web/src/app/api/extension/auth/email/route.ts`
- `apps/web/src/app/api/cli/auth/{confirm,start,poll}/route.ts`
- `apps/web/src/app/api/wizard/auth/{start,poll}/route.ts`
- `apps/web/src/server/services/{google,local,email}-auth-service.ts`
- `apps/web/src/server/services/extension-connect-service.ts`
- `apps/web/src/server/services/browser-session-handoff-service.ts`
- `apps/web/src/server/services/mcp-token-service.ts`
- `apps/web/src/server/services/auth-sync-service.ts`

**Resolution:** connect via a dedicated `relay_auth` service role with
`bypassrls=true`, OR keep `relay_app` and grant explicit row-level access on
just the auth tables (`profiles`, `email_otp`, `cli_auth_sessions`,
`extension_connect_grants`, `pending_*`). The first option is simpler — auth
tables don't have multi-tenant RLS anyway, so a bypass role here is fine.

### Group B — Webhooks (no viewer, external trigger)

- `apps/web/src/app/api/webhooks/polar/route.ts` (billing events)

**Resolution:** same as Group A — `relay_auth` (or rename to
`relay_service`). Webhooks need to write into `profiles`, `subscriptions`,
billing tables across users.

### Group C — Cron / internal jobs (already partly wired)

- `apps/web/src/app/api/cron/memory-pipeline/route.ts` ← already uses
  `createWorkerRepositoryProvider()` which reads `WORKER_DATABASE_URL`.
- `apps/web/src/app/api/cron/embedding-backfill/route.ts` ← uses
  `createRepositoryBundle()` (no override). Switch to
  `createWorkerRepositoryProvider()` for consistency.
- `apps/web/src/app/api/internal/jobs/cron/route.ts` ← daily drain. Same fix.
- `apps/web/src/server/services/cost-snapshot-service.ts` ← invoked by the
  internal cron.

**Resolution:** all cron paths use `createWorkerRepositoryProvider()`, which
reads `WORKER_DATABASE_URL`. Point `WORKER_DATABASE_URL` at `relay_worker`
(non-owner, `bypassrls=true` for the table-spanning sweep, OR `bypassrls=false`
with explicit grants — `relay_worker` needs to write across every user's
space which is essentially admin work, so bypass is justified here).

### Group D — Account deletion (full admin)

- `apps/web/src/app/api/account/delete/route.ts`
- `apps/web/src/server/services/account-deletion-service.ts`
- `apps/web/src/components/auth/delete-account-action.ts`

**Resolution:** uses `relay_auth` / `relay_service`. Deletion has to cascade
across every owned record; RLS would block it under the user's own role.

### Group E — Service-layer call sites that DO have a viewer downstream

The `viewer.ts` policy module + `entitlement-service.ts` + `source-service.ts`
+ `billing-service.ts` all call `createRepositoryBundle()` but receive a
`userId` upstream from the route handler. These should switch to
`createRepositoryBundle(viewerUserId)` so the GUC propagates.

Grep audit needed once we flip `DATABASE_URL` — any route that still calls
the no-arg form for a user-scoped read will get RLS-denied after the swap.
That's the actual safety net we want.

### Group F — Trivial / decorative

- `apps/web/src/app/api/health/route.ts` — health probe. `SELECT 1`. Any
  role is fine.

## The three roles we provision

Already in `docs/memory-v2/roles.sql`:

| Role | bypassrls | Used by | Connection string env |
|------|-----------|---------|------------------------|
| `relay_app` | **false** | Main web app — user-scoped reads/writes | `DATABASE_URL` |
| `relay_worker` | **true** | Memory-pipeline cron, embedding-backfill, daily drain | `WORKER_DATABASE_URL` |
| `relay_service` | **true** | Pre-auth, webhooks, account-deletion | `SERVICE_DATABASE_URL` (new) |

`relay_service` is new — `roles.sql` ships `relay_worker` already; extend the
SQL block before the cutover.

## Cutover procedure (Step 11 of the deploy sequence)

This is intentionally last because the surface area for breakage is large.
Do not bundle with the migration / Gemini extractor steps.

1. **Provision the three roles** via `mcp__Neon__run_sql_transaction` against
   prod (idempotent block from `roles.sql`).
2. **Set `WORKER_DATABASE_URL=relay_worker`** in Vercel env. Already wired —
   the existing memory-pipeline cron picks it up. Run 24h, watch
   `pg_stat_activity` for permission-denied errors.
3. **Set `SERVICE_DATABASE_URL=relay_service`**. Update `account-deletion-
   service.ts`, `webhooks/polar/route.ts`, and each Group-A service to read
   via a new `createServiceRepositoryProvider()` helper that returns the
   service-role provider when the env is set. Run 24h.
4. **Update Group-E call sites**: ensure every user-scoped route passes
   `viewerUserId` to `createRepositoryBundle`. Grep:
   `grep -n "createRepositoryBundle()" apps/web/src/server | grep -v test`
   — should return 0 hits after this step (excluding the wrappers themselves).
5. **Swap `DATABASE_URL` to `relay_app`**. Keep the old value in
   `LEGACY_DATABASE_URL` for one-line rollback. Deploy.
6. **48h watch.** Monitor:
   - Vercel logs: any `permission denied for table ...` or
     `new row violates row-level security policy ...`
   - `pg_stat_activity`: failed connections.
   - Sentry / PostHog `$exception` events filtered to RLS keywords.
7. If anomalies: flip `DATABASE_URL` back to `LEGACY_DATABASE_URL`. Investigate
   offline.
8. After clean 48h, remove `LEGACY_DATABASE_URL` from Vercel.

## Status — code wiring landed (provider + call sites)

The code wiring is now DONE (was previously deferred to "the F3 PR proper"):

- `packages/db/src/store/provider.ts`: **viewer GUC bug fixed** — bare `query()`
  with a viewer now runs `set_config` + the query in one transaction (was two
  autocommit statements, so the transaction-local GUC was lost and relay_app
  would have returned 0 rows). Added `createServiceRepositoryProvider()` and
  `createServiceRepositoryBundle()` / `createWorkerRepositoryBundle()` helpers.
- `docs/memory-v2/roles.sql`: now provisions all three roles (`relay_app`,
  `relay_worker`, `relay_service`) idempotently with grants + EXECUTE; console
  bypassrls steps documented.
- All 31 no-arg `createRepositoryBundle()` sites rewired:
  - Cron/cross-tenant → `createWorkerRepositoryBundle()` (embedding-backfill,
    internal jobs cron, cost-snapshot ×3, hygiene fallback, source sweep).
  - Pre-auth / webhooks / deletion / IP-rate-limit → `createServiceRepositoryBundle()`
    (auth-sync, local/google auth, mcp-token ×5, extension-connect, browser
    handoff, cli/wizard auth, account deletion ×3, viewer token resolve, polar
    webhook ×2, consumeIpRateLimit).
  - Only `api/health/route.ts` (`SELECT 1`) keeps the plain no-arg form.
- Verify after future edits: `rg -n "createRepositoryBundle\(\)" apps/web/src -g '!*.test.*'`
  should return only `health/route.ts`.

All three providers fall back to `DATABASE_URL` when their env var is unset, so
this is a **no-op at runtime** until the operational cutover (step 11) sets
`WORKER_DATABASE_URL` / `SERVICE_DATABASE_URL` and swaps `DATABASE_URL` to
`relay_app`.

## Follow-ups still owed at cutover (not code)

- **Neon console**: enable Bypass RLS on `relay_worker` + `relay_service` only.
- **No-RLS, user-scoped tables** rely on SQL `user_id` filters, not RLS — a
  missed `where user_id = …` would leak under relay_app. Add RLS as
  defense-in-depth or confirm callers always filter: `user_milestones`
  (read in mcp/stream + user-milestones-service), `provider_counter_snapshots`,
  `memory_pipeline_jobs`, `memory_half_lives` (worker-only — fine).
- **RLS-enabled, no write policy** (`target_profiles`, `global_sources`): writes
  today come from migrations/seed (owner) and the source pipeline (worker), not
  user routes — safe, but add write policies if a relay_app path ever writes them.
- **Migration numbering**: `0047` is intentionally skipped. The runner
  (`scripts/db-admin.js`) sorts lexically + tracks applied filenames, so a gap is
  harmless; no `0047_*.sql` is required.

## Regression guard

`packages/db/src/store/rls-enforcement.test.ts` (env-gated on
`RLS_TEST_DATABASE_URL`) connects as a non-owner role and asserts cross-tenant
isolation — run it against a branch where roles + bypassrls are provisioned to
prove enforcement actually binds before flipping prod.
