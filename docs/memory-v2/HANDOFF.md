# Memory Architecture v2 — Handoff

**Branch:** `feat/memory-v2-architecture`
**Plan:** `~/.claude/plans/hey-i-need-you-composed-sunbeam.md`
**Neon dev branch:** `memory-v2-dev` (id `br-wild-hill-agavkwb4`) ← prod `br-small-moon-agn70urq`, project `shiny-term-32281581`.

## What shipped

### Schema (migrations `0040`–`0047`)

| File | Purpose |
|---|---|
| `0040_spaces.sql` | New `spaces` (kind: personal/project) + `space_members` + `public.is_space_member(uuid)` + RLS. Backfilled 1 project space per project, 1 personal space per profile. |
| `0041_bitemporal_canon.sql` | `memory_items` gains `space_id`, `valid_from`, `valid_until`, `expired_at`, `lifecycle_state` (`active`/`cooling`/`archived`/`forgotten`). Installs `trg_memory_items_lifecycle_sync` so `is_archived` ↔ `lifecycle_state` stay in sync — `lifecycle_state` is the source of truth. |
| `0042_observations.sql` | New `observations` table (free-form text + optional SVO triples), bi-temporal, HNSW + GIN + (subject, predicate) indexes, RLS. Extends `memory_events.event_type` CHECK with `observation_*`, `entity_relation_*`, `cooled`, `restored_auto`, `forgotten`, `obsoleted`, `decay_proposed`. |
| `0043_entity_relations.sql` | New `entity_relations` (entity↔entity typed edges, bi-temporal). Partial unique index `(source, target, relation_type) WHERE valid_until IS NULL` so only one current edge per shape. |
| `0044_space_id_backfill.sql` | Adds `space_id` to `canonical_entities`, `entity_mentions`, `source_sessions`, `bootstrap_packets`, `memory_events`, `project_sources`. Enables RLS on `canonical_entities` + `entity_mentions` (previously missing) with dual-path (space OR project). |
| `0045_integration_surfaces.sql` | `ALTER TYPE platform_type ADD VALUE` for gmail / slack / github / linear / calendar / telegram / whatsapp. Schema-ready only — no adapters yet. |
| `0046_memory_hygiene.sql` | `enrichment_status` + `enrichment_version` + `enrichment_error` + `enriched_at` on `memory_items` + `observations`. Backfills the 604 existing rows to `done`/`v1` so the worker won't re-extract. New `memory_half_lives` lookup table seeded with type→days. |
| `0047_nullable_project_id.sql` | Drops `NOT NULL` on `project_id` for the 6 affected tables + adds `*_scope_check` CHECK ensuring space_id OR project_id is set. Required for personal-space writes (personal spaces have no backing project). |
| `0048_post_review_fixes.sql` | **Post-review.** Recreates the HNSW indexes on `observations.embedding` + `memory_items.embedding` as **partial** (`WHERE embedding IS NOT NULL`) so they don't walk un-embedded rows. Relaxes `entity_mentions` RLS to **dual-path** (space-OR-project via the owning memory item) so legacy writers that don't set `space_id` aren't silently blocked. |

Applied + verified on the dev branch. Verification snapshot:

| Check | Result |
|---|---|
| Personal spaces == profiles | 68 == 68 |
| Project spaces == projects | 47 == 47 |
| `space_members` rows | 115 (47 project memberships + 68 personal owners) |
| `memory_items` NULL space_id / lifecycle_state / valid_from | 0 / 0 / 0 |
| Lifecycle backfill | 398 active + 206 archived (matches prior `is_archived`) |
| Enrichment backfill | 604 `done` / 0 `pending` |
| RLS enabled | all 11 expected tables, incl. newly-secured `canonical_entities` + `entity_mentions` |
| `platform_type` enum | + 7 integration surfaces |
| `memory_events.event_type` CHECK | 16 values total |
| `memory_half_lives` seeded | 7 rows |
| Trigger sanity | `lifecycle_state` ↔ `is_archived` round-trips clean |
| Personal-space write with NULL `project_id` | works |

**Post-review verification (this branch):**

| Check | Result |
|---|---|
| `pnpm -r typecheck` | clean across all 12 workspaces |
| `pnpm test:stable` | 75 passed |
| New unit tests (`decay`, SVO conflict, worker `processItem`, `hygiene`, recall wiring) | 85 passed (`npx vitest run packages/shared/src/utils/decay.test.ts packages/shared/src/utils/merge-governed.test.ts packages/workers/memory-pipeline/src/*.test.ts packages/mcp/src/tools/recall-context.test.ts packages/mcp/src/tools/tools.test.ts packages/mcp/src/tools/register.test.ts`) |
| Migration `0048` | **applied + verified on the dev branch** — partial HNSW indexes confirmed (`WHERE (embedding IS NOT NULL)`); `entity_mentions` dual-path read/write policies confirmed |
| RLS enforcement audit | prod app role `neondb_owner` is `bypassrls=true`, owns all tables, **0 tables FORCE RLS** → RLS does **not** bind the prod first-party connection (see Risks) |

### Code

**New packages / dirs:**

- `packages/db/src/repositories/space-repository.ts` — Space CRUD, `ensurePersonalSpaceForUser`, `resolveSpaceForProject`, member management.
- `packages/db/src/repositories/observation-repository.ts` — Observation CRUD + bi-temporal filters + hybrid (vector + tsvector) search + SVO conflict lookup + invalidation.
- `packages/db/src/repositories/entity-relation-repository.ts` — Entity↔entity edges with `upsertCurrent` (closes prior via valid_until on rewrite), `invalidate`, traversal helpers.
- `packages/db/src/repositories/graph-repository.ts` — Recursive-CTE traversal (`expandFromEntities`) + `getSpaceGraphSnapshot` for dashboard.
- `packages/shared/src/utils/decay.ts` — `LIFECYCLE_HALF_LIFE_DAYS`, `computeDecayMultiplier`, `proposeLifecycleTransition`. Hard rules: pinned / authority / recent-write protections.
- `packages/workers/memory-pipeline/` — New workspace package. `src/index.ts` exports `processItem(...)`, `tick(...)`. `src/hygiene.ts` exports `runHygieneTick(...)` (decay sweep + smart auto-resurrect on new evidence).

**MCP** (`packages/mcp`):

- `set_current_space` tool added; `set_current_project` kept as a shim (the user's global CLAUDE.md still references it).
- `manage_memory` action enum: `update | delete | archive | restore | forget | mark_obsolete | reaffirm`. `forget` requires `confirm: true`.
- `add_memory` accepts optional `spaceId`. Personal-space writes route to `/api/spaces/[id]/memory`.
- `recall` is **fully wired** (second review pass): `spaceId` routes the query/list/search sub-tools to the space endpoints; `includeArchived` + `filters.lifecycleStates` flow to the server filter; `include:[observations,entities]` returns the observation hybrid-search hits + entity-graph snapshot. `recall-context`/`search-context`/`list-memory` all take `spaceId` + lifecycle params now (not just the schema).

**Web service path** (`apps/web/src/server/services/memory-service.ts`):

- `createMemoryItem` no longer runs the synchronous in-memory dedup scan. Dedup is now async via the worker. Capture latency on projects with >500 items should be measurably faster.
- `updateMemoryItem` honors new `lifecycleState`, `validUntil`, `lastReaffirmedAt`, `confirm` fields. Emits the right event type per transition (`archived` / `restored` / `cooled` / `forgotten` / `reaffirmed`).

**Web endpoints**:

- `POST/GET /api/spaces/[id]/memory` — new endpoint for personal-space (and any space-scoped) writes. Resolves space via `space_members`, sets `project_id=NULL` for personal spaces.
- `GET /api/projects/[id]/memory/relations` — payload extended with `entityRelations` + `observationsSummary` (total + recent 25).
- `GET /api/cron/memory-pipeline` — Vercel cron entry. Authenticated via `CRON_SECRET`. Currently runs embed-only ticks + hygiene dry-run by default; flip `RELAY_MEMORY_PIPELINE_FULL=true` once the entity/observation extractors are wired, and `RELAY_HYGIENE_DRY_RUN=false` to apply transitions.

**Dashboard**:

- `(workspace)/personal/page.tsx` — personal-space list view. Lazy-creates the personal space on first visit via `ensurePersonalSpaceForUser`.
- `memory-graph-utils.ts` — synthetic root→type-hub→item fallback is gated behind `realEdgeCount < 8`. Once a project has 8+ real edges (relations + similarity + source/entity links + entity_relations once worker runs), the synthetic hub stops dominating the render.

**Shared schemas & types**:

- `createMemoryItemSchema` and `updateMemoryItemSchema` extended with v2 fields.
- `MemoryEventType` extended with all v2 event types.
- `CreateMemoryItemInput.projectId` now nullable, `.spaceId` added.

## Post-review fixes (applied in this PR)

Review of the first cut surfaced 6 high / 9 medium / 6 low issues + missing test
coverage. All addressed on this branch:

| # | Fix | Where |
|---|---|---|
| A1 | Cron route now **fails closed in production** when `CRON_SECRET` is unset (warns in dev). | `apps/web/src/app/api/cron/memory-pipeline/route.ts` |
| A2 | Removed the no-op `extractEntities/extractObservations` ternary; worker is honestly embed-only until the extractor PR. | same route |
| A3 | Worker entity creation uses new `EntityRepository.findOrCreateBySpace` (personal items have NULL `project_id`). | `packages/db/.../entity-repository.ts`, worker `index.ts` |
| A4 | Hygiene no longer coerces NULL `project_id` to the string `"null"`; `memory_events.project_id` is real NULL for personal-space rows. | `packages/workers/memory-pipeline/src/hygiene.ts` |
| A5 | `observation_expired` audit rows carry the real superseding observation id (was `"(pending)"`). | worker `index.ts` |
| A6 | `GET /api/spaces/[id]/memory` returns typed `MemoryItemRow[]` via new `MemoryRepository.listBySpace` — no raw `search_vector`/snake_case leak. | spaces route, `memory-repository.ts` |
| A7 | `updateMemoryItem` is one atomic `UPDATE` (legacy + v2 lifecycle columns); forget also blanks `search_vector`. | `memory-service.ts`, `memory-repository.ts` |
| A8 | Lifecycle + reaffirm now emit **separate** events (no single-pick ladder dropping a signal). | `memory-service.ts` |
| A9 | `updateMemoryItemSchema` enforces `confirm:true` when `lifecycleState="forgotten"` at the schema boundary. | `packages/shared/src/schemas/memory.ts` |
| A10 | HNSW indexes made partial (migration 0048). | `0048_post_review_fixes.sql` |
| A12 | `observation.hybridSearch` implements **true RRF** (k=60) instead of mixing cosine + ts_rank scales. | `observation-repository.ts` |
| A13 | MCP `manage_memory` bulk verbs run concurrently (`Promise.allSettled`). Also fixed "Failed to **deleted**" → "Failed to **delete**" grammar. | `packages/mcp/src/tools/manage-memory.ts` |
| A14 | `set_current_space` now actually caches per-session; `recall` + `save(add_memory)` fall back to it. | `register.ts`, `server.ts` |
| A15 | Relations route folds the observations count + recent-25 into one CTE query. | relations route |
| A16 | Removed the duplicate `LIFECYCLE_HALF_LIFE_DAYS` alias export. | `decay.ts`, hygiene |
| A17 | `listAllSpaceIds` is bounded (`ORDER BY updated_at DESC LIMIT 500`). | hygiene |
| A18 | `entity_mentions` RLS is dual-path (migration 0048). | `0048_post_review_fixes.sql` |
| A19 | Spaces route reuses one repository bundle per request. | spaces route |
| A20 | `ObservationRow.hasEmbedding` exposed so the worker can skip re-embeds. | `observation-repository.ts` |
| A21 | `processItem` claim is atomic (`WHERE enrichment_status IN ('pending','failed') RETURNING id`); double-claim returns `skipped`. | worker `index.ts` |
| A22 | New unit tests (see verification). | `decay.test.ts`, `merge-governed.test.ts`, worker `index.test.ts` + `hygiene.test.ts` |

**Known dormant item (deferred to the extractor PR):** `MemoryItemRow.projectId`
is typed `string` but the DB column is nullable post-0047; the mapper still
coerces a NULL `project_id` to the literal string `"null"`. This path is only
reached when the worker's entity/observation **extractors** run, which are not
wired in this PR (embed-only). It will be fixed when follow-up PR #4 exercises
the path. `spaceId` was added to `MemoryItemRow` (optional) + `MEMORY_COLS` so
the worker can resolve a usable scope today.

## Second review pass (recall wiring + correctness)

A second review of the post-review branch found the `recall` surface advertised
params it never honored, plus two correctness gaps. All fixed in commit `8f4fc92`:

| # | Fix | Where |
|---|---|---|
| B1 | **`recall` fully wired** (was: schema-only). `searchMemoryItems` + `memory-repository.search`/`hybridSearch` take `spaceId` / `lifecycleStates` / `includeArchived` (default active+cooling, never `forgotten`). New `getSpaceContext` powers `include:[observations,entities]` (reuses `ObservationRepository.hybridSearch` + `GraphRepository.getSpaceGraphSnapshot`). New `GET /api/spaces/[id]/memory/search`; project search route gains the same lifecycle + channel params. MCP `recall`/`recall-context`/`search-context`/`list-memory` route by `spaceId`. | `memory-service.ts`, `memory-repository.ts`, both search routes, 4 MCP tools |
| B2 | **Half-lives single source of truth.** `memory-decay.ts` `DECAY_HALF_LIFE_DAYS` now matches the `0046` `memory_half_lives` seed (was a third, disagreeing set). Shifts legacy `computeDecayScore` to the longer half-lives — intended. | `packages/shared/src/utils/memory-decay.ts` |
| B3 | **Stale `entity_relation` superseded on SVO object change.** `EntityRelationRepository.invalidateCurrentForSubjectPredicate` closes the prior current edge (different target dodges the partial-unique index) before the worker upserts the new one — one current edge per `(subject, predicate)`. | `entity-relation-repository.ts`, worker `index.ts` |
| B4 | **RLS enforcement verified, not a worker blocker.** Audited the prod role: `neondb_owner` has `bypassrls=true` + owns the tables + no FORCE RLS, so the worker's no-viewer writes succeed in prod. No worker scoping change needed. (Security caveat in Risks.) | n/a (verification) |

New tests: `packages/mcp/src/tools/recall-context.test.ts` (space routing + channels)
and a B3 case in worker `index.test.ts` (SVO object-change supersession).

## What's deferred — follow-up PR roadmap

Four separate PRs, each branched from updated `main`. Only **production cutover**
remains outside these.

| PR | Scope | Key files |
|---|---|---|
| #1 Extension space picker | New `GET /api/spaces`; extension two-level picker (Personal + projects); personal capture routes to `/api/spaces/[id]/memory`. | `apps/extension/src/components/control-panel.tsx` (~2570), `apps/extension/src/background/index.ts` (~120 state, ~4118 write) |
| #2 Agent chat hygiene hints + command parser | Render `cooling`/`archived` pills on recall hits; new `command-parser.ts` for `/reaffirm`, `/forget`, `/obsolete`, `/archive`, `/restore` (forget confirms first). | `apps/web/src/components/assistant/action-result-card.tsx`, `use-assistant-chat.ts`, `packages/shared/src/utils/assistant-chat-path.ts` |
| #3 Decay into recall ranking | Scope + lifecycle filtering already wired (B1). Remaining: multiply final scores by `computeDecayMultiplier`; load `memory_half_lives` once/req (60s cache); same in MCP fusion. | `apps/web/src/server/services/memory-service.ts` (`searchMemoryItems`), `packages/mcp/src/tools/recall-context.ts`, `search-context.ts`, `bootstrap-service.ts` (~380) |
| #4 Worker full extraction (Gemini) | New `memory-pipeline-providers.ts` with `buildEntityExtractor`/`buildObservationExtractor` via `runGeminiJsonWithFallback`; cost gate via `ai-budget-service.ts` (`RELAY_PIPELINE_DAILY_USD_CAP`, default `$5`); wire behind `RELAY_MEMORY_PIPELINE_FULL=true`. Also fixes the dormant `projectId` NULL→"null" mapper item above. | `apps/web/src/server/services/memory-pipeline-providers.ts` (new), `entity-extraction-service.ts`, cron route |

## How to review + test on the dev branch

1. **Point local at the dev branch.** Set `DATABASE_URL` (and `MIGRATION_DATABASE_URL`) to the dev-branch URL — I used `postgresql://neondb_owner:npg_8BMkX5hrqpji@ep-silent-bonus-agt4o0d4-pooler.c-2.eu-central-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require`. (Rotate password before sharing.)
2. **Verify migrations applied.**
   ```bash
   MIGRATION_DATABASE_URL=<dev-branch-url> node scripts/db-admin.js migrate
   # Expect: "Migration run complete. Applied 0 file(s), skipped 47 file(s)."
   ```
3. **Typecheck the whole repo.** Already verified clean across all 12 workspaces.
   ```bash
   pnpm -r typecheck
   ```
4. **Spin up web.**
   ```bash
   pnpm --filter @relay/web dev
   ```
   Open `/dashboard` for a project space — graph view should still render. Synthetic hub fallback is now gated, so projects with ≥8 edges (real relations + similarity + source/entity links) won't show the root→type-hub→item pattern.
5. **Open `/personal`.** First load auto-creates the personal space + member row. Empty state until something writes there.
6. **Smoke the new MCP actions.** Use the Relay MCP client (Claude Code / Cursor) against the dev backend:
   - `save({ action: "add_memory", payload: { type: "note", content: "test", spaceId: "<personal-space-id>" } })` — should land in `memory_items` with `space_id` set and `project_id=NULL`.
   - `save({ action: "manage_memory", payload: { action: "reaffirm", memoryId: "<id>" } })` — bumps `last_reaffirmed_at`.
   - `save({ action: "manage_memory", payload: { action: "mark_obsolete", memoryId: "<id>" } })` — sets `valid_until=now()` + lifecycle `cooling`.
   - `save({ action: "manage_memory", payload: { action: "archive", memoryId: "<id>" } })` then `... restore ...` — round-trips `lifecycle_state`.
   - `save({ action: "manage_memory", payload: { action: "forget", memoryId: "<id>", confirm: true } })` — nulls content + sets `forgotten`.
7. **Hit the cron route.**
   ```bash
   curl -s http://localhost:3000/api/cron/memory-pipeline | jq
   ```
   Returns `{ tick: { processed: 0, ... }, hygiene: { spacesProcessed: 115, ... } }` because no pending rows + dry-run hygiene by default.
8. **(Optional) Try the SQL verification snippets in `/docs/memory-v2/VERIFICATION.sql`** for hand-checks.

### Post-review test steps (this branch)

9. **Migration 0048 is already applied to the dev branch** (idempotent DDL run
   directly + verified). Partial HNSW indexes (`WHERE (embedding IS NOT NULL)`)
   on `observations.embedding` + `memory_items.embedding`, and the dual-path
   `entity_mentions` read/write policies are confirmed present. The repo
   migration runner will re-apply it harmlessly on the next `migrate` (every
   statement is `if exists`/`if not exists`).
10. **Cron auth fail-closed.** With `NODE_ENV=production` and no `CRON_SECRET`,
    `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/cron/memory-pipeline`
    returns `401`. In dev (no secret) it returns `200` and logs a warning.
11. **Personal-space hygiene.** Insert a personal-space `memory_item` with
    `last_reaffirmed_at` ~200 days ago, run the cron with
    `RELAY_HYGIENE_DRY_RUN=false`, and confirm the emitted `memory_events` row
    has `project_id IS NULL` (not the string `"null"`).
12. **Forget schema gate.** `save({ action: "manage_memory", payload: { action: "update", memoryId: "<id>", lifecycleState: "forgotten" } })` without `confirm` → 400 at the route boundary.
13. **Space cache.** `set_current_space({ spaceId })` then `save({ action: "add_memory", payload: { type: "note", content: "x" } })` (no `spaceId`) → row lands in the cached space.
14. **Unit tests.** `pnpm test:stable` (75) and the new files (50) both green.

## Risks (open)

- **RLS is non-enforcing for the prod first-party connection.** Prod `DATABASE_URL` connects as `neondb_owner`, which has `rolbypassrls=true`, owns every table, and no table has `FORCE ROW LEVEL SECURITY`. So all the `is_project_member` / `is_space_member` / dual-path policies provide **zero runtime enforcement** in prod — they are decorative for the app's own connection. Local dev (`relay` role) is non-owner, so RLS binds there. This is broader than Memory v2 (predates it) but was surfaced by the v2 review. Decide intentionally: either run the app under a least-privilege non-owner role (then RLS actually protects), or accept that isolation is enforced only in app code + accept the policies as defense-in-depth for any future restricted role. **Not blocking the worker** (writes succeed precisely because of this), but worth a deliberate call.
- **Worker entity/observation extraction is not wired (embed-only).** The cron embeds new rows + sweeps decay; it does **not** populate `observations` / `entity_relations` yet (follow-up PR #4). Old `postCreateHook` still runs inline so legacy entity_mentions + embeddings keep working — no regression vs prod today.
- **Dual-path RLS on `canonical_entities` / `entity_mentions` is permissive by design.** A row authorizes if EITHER the space or the project predicate passes. Once one stable week confirms nothing reads `project_members` directly anymore, drop the legacy path in a follow-up migration.
- **`forgetting` is irreversible after content null.** Enforced (`confirm:true`) at both the MCP tool and the Zod schema now. Any future UI caller (extension, dashboard quick actions) must still confirm before calling.
- **Dormant `projectId` mapper coercion.** `toMemoryRow` maps a NULL `project_id` to the string `"null"` (type says `string`). Only reached by the worker extractor path, which is off in this PR. Fixed in follow-up PR #4.
- **Harmless residue in 0040.** `spaces_personal_unique_per_owner` is created and immediately dropped in the same migration (replaced by a partial unique index). Already applied to the dev branch; left as-is for migration-history integrity.
- **0048 is applied on the dev branch (resolved there).** The legacy async `entity_mentions` INSERT in `entity-extraction-service.ts:19` doesn't set `space_id`; 0044's space-only write policy would have blocked it, but 0048's dual-path policy authorizes via the owning project. Applied + verified on dev. **Still must be applied to prod** as part of cutover (it's in the `0040`–`0048` set). Note: moot on prod anyway while the app connects as the bypassrls owner (see the RLS risk above) — but required the moment the app moves to a restricted role.

## Merging with `main` (the branch is behind by the Neon-cost work)

`feat/memory-v2-architecture` branched from `9d4ac22`; `main` has since added
three caching/egress commits (`71d31db`, `ff482cd`, `6a81721`) not in this
branch. Two files overlap and will need manual reconciliation on merge:

- **`packages/db/src/repositories/memory-repository.ts`** — `main` dropped
  `search_vector` from `MEMORY_COLS`; this branch added `space_id` to the same
  line. Keep both edits (add `space_id`, drop `search_vector`). `main` also
  added `countByProject` + `listRoutingSamplesByProject`; this branch added
  `listBySpace` + v2 columns in `update`. They don't overlap textually beyond
  the `MEMORY_COLS` line.
- **`apps/web/src/server/services/memory-service.ts`** — `main` added
  `invalidateProjectCache(userId, projectId)` calls in `createMemoryItem`,
  `createMemoryItemBatch`, `updateMemoryItem`, and `deleteMemoryItem` (imports
  from `@/server/cache/invalidation`, which is new in `main`). After merge,
  re-add those four cache-invalidation calls — `updateMemoryItem` was
  restructured here (atomic update + split events), so place the call after the
  event emits, before `return item`.

Everything else this PR touches (worker, observation/entity/space repos,
migrations, MCP tools, schemas, decay) is untouched by `main` → conflict-free.

## Production cutover (when ready)

The same migration runner against prod:

```bash
MIGRATION_DATABASE_URL=<PROD_URL> node scripts/db-admin.js migrate
```

Migrations are additive; rollback is `-- DOWN` SQL in each file. Recommended sequence:

1. Snapshot prod, or rely on Neon point-in-time recovery (history_retention_seconds=21600 on this project — 6h).
2. Maintenance window: ~5–10 min (the largest backfill is `memory_items.space_id` over 604 rows on this branch; prod will be larger).
3. Apply migrations (now `0040`–`0048`).
4. Deploy code from `feat/memory-v2-architecture` (or merged main).
5. Set **`CRON_SECRET`** before the first cron tick (the route fails closed in production without it).
6. Hold off enabling `RELAY_MEMORY_PIPELINE_FULL` until the extractors land (follow-up PR #4).
7. Monitor `memory_events` for `cooled` / `restored_auto` activity from the hygiene tick.
8. Decay multiplier hooks land in follow-up PR #3 — until then recall behaviour is identical to today's.

### Environment variables

| Var | Default | Effect |
|---|---|---|
| `CRON_SECRET` | unset | Required in production — `/api/cron/memory-pipeline` returns 401 without a matching `Authorization: Bearer <secret>`. Unset is allowed only in non-production (logs a warning). |
| `RELAY_HYGIENE_DRY_RUN` | `true` | When `true`, the hygiene sweep logs proposed transitions without writing. Flip to `false` after a week of clean dry-run logs. |
| `RELAY_MEMORY_PIPELINE_FULL` | `false` | Reserved. No effect until follow-up PR #4 wires the Gemini extractors. |
| `RELAY_PIPELINE_DAILY_USD_CAP` | `5` (PR #4) | Daily Gemini spend cap for the extractor; circuit-breaker, not a usage ration. Watch `ai_budget` for 24h after enabling, then consider `1`. |

## Files touched (top-level summary)

```
packages/db/neon/migrations/0040_spaces.sql                                   (new)
packages/db/neon/migrations/0041_bitemporal_canon.sql                         (new)
packages/db/neon/migrations/0042_observations.sql                             (new)
packages/db/neon/migrations/0043_entity_relations.sql                         (new)
packages/db/neon/migrations/0044_space_id_backfill.sql                        (new)
packages/db/neon/migrations/0045_integration_surfaces.sql                     (new)
packages/db/neon/migrations/0046_memory_hygiene.sql                           (new)
packages/db/neon/migrations/0047_nullable_project_id.sql                      (new)
packages/db/neon/migrations/0048_post_review_fixes.sql                        (new: partial HNSW + entity_mentions dual-path RLS)
packages/db/src/mappers/memory-mapper.ts                                      (modified: spaceId mapped)
packages/db/src/repositories/entity-repository.ts                            (modified: findOrCreateBySpace + addMention spaceId)
packages/db/src/repositories/space-repository.ts                              (new)
packages/db/src/repositories/observation-repository.ts                        (new)
packages/db/src/repositories/entity-relation-repository.ts                    (new)
packages/db/src/repositories/graph-repository.ts                              (new)
packages/db/src/repositories/memory-repository.ts                             (modified: space_id + valid_from in create)
packages/db/src/queries/repository-bundle.ts                                  (modified: new repos exposed)
packages/db/src/index.ts                                                      (modified: re-exports)
packages/shared/src/utils/decay.ts                                            (new)
packages/shared/src/utils/merge-governed.ts                                   (modified: resolveObservationConflict)
packages/shared/src/utils/memory-decay.ts                                     (modified: observation half-life)
packages/shared/src/schemas/memory.ts                                         (modified: spaceId, lifecycle fields)
packages/shared/src/types/memory.ts                                           (modified: spaceId, nullable projectId)
packages/shared/src/types/database.ts                                         (modified: MemoryEventType extended)
packages/shared/src/index.ts                                                  (modified: re-exports decay)
packages/workers/memory-pipeline/package.json                                 (new)
packages/workers/memory-pipeline/tsconfig.json                                (new)
packages/workers/memory-pipeline/src/index.ts                                 (new)
packages/workers/memory-pipeline/src/hygiene.ts                               (new)
packages/mcp/src/tools/register.ts                                            (modified: set_current_space)
packages/mcp/src/tools/add-memory.ts                                          (modified: spaceId)
packages/mcp/src/tools/recall.ts                                              (modified: includeArchived + lifecycle filter)
packages/mcp/src/tools/manage-memory.ts                                       (rewritten: new action verbs)
apps/web/src/app/api/spaces/[id]/memory/route.ts                              (new)
apps/web/src/app/api/cron/memory-pipeline/route.ts                            (new)
apps/web/src/app/api/projects/[id]/memory/relations/route.ts                  (modified: entityRelations + observations summary)
apps/web/src/app/(workspace)/personal/page.tsx                                (new)
apps/web/src/server/services/memory-service.ts                                (modified: drop sync dedup, lifecycle wiring)
apps/web/src/features/graph/memory-graph-utils.ts                             (modified: synthetic hub gating)
apps/web/package.json                                                         (modified: @relay/memory-pipeline dep)
pnpm-workspace.yaml                                                           (modified: packages/workers/*)
```

## Third pass — bundle everything into PR #35 (2026-05-26)

Direction changed: rather than ship 4 follow-up PRs after cutover, the user
asked to fold everything into PR #35 and validate on a fresh dev Neon branch
with real user data before any prod deploy. New work landed:

| Item | Where |
|---|---|
| Merge `main` (3 caching + 3 landing commits) | conflict resolution in `memory-repository.ts` (`MEMORY_COLS` keeps `space_id`, drops `search_vector`) + `memory-service.ts` (4 `invalidateProjectCache` calls re-added + null-guarded for personal-space items) |
| Worker role plumbing | new `createWorkerRepositoryProvider()` reads `WORKER_DATABASE_URL`; cron route uses it (falls back to `DATABASE_URL` when unset). `docs/memory-v2/roles.sql` documents the role-create SQL (manual apply via Neon SQL editor, not a tracked migration). App stays on `neondb_owner` for now — full app-role swap is a follow-up. |
| Gemini extractors | new `apps/web/src/server/services/memory-pipeline-providers.ts` (`buildEntityExtractor`, `buildObservationExtractor`, `buildPipelineBudgetGate`). Cron route wires them when `RELAY_MEMORY_PIPELINE_FULL=true`. `PIPELINE_VERSION` bumped 1→2. `MemoryItemRow.projectId` widened to `string \| null` + `memoryEvents.create` accepts null `projectId` so personal-space writes don't crash. 7 new unit tests. |
| Decay into recall ranking | `searchMemoryItems` multiplies `similarity * computeDecayMultiplier` on the final sort (tie-break inside entity-boost buckets; primary sort otherwise). New 60s module-scoped `loadHalfLives()` cache reads live values from `memory_half_lives`. MCP local fallback scorer untouched (server covers >95% of paths). |
| `GET /api/spaces` | new route returns `[{id, kind, name, projectId}]` for the viewer + lazy-creates the personal space. Extension UI picker DEFERRED to a follow-up PR (control-panel.tsx is 2570+ lines + heavily coupled to project-specific chat association — out of scope for #35). |
| Assistant chat command parser | new `packages/shared/src/utils/assistant-command-parser.ts` + 19 unit tests. Parses `/reaffirm`, `/forget`, `/obsolete`, `/archive`, `/restore` and maps to `/api/memory/[id]` PATCH payloads. Hook integration into `use-assistant-chat.ts` + cooling/archived pills in `action-result-card.tsx` DEFERRED to a follow-up UI PR. |
| Graph CTE cycle guard | `expandFromEntities` recursive CTE now tracks visited entity IDs in a `visited` array column and excludes them on each iteration. Prevents infinite loops once the worker populates real edges. |
| Spaces archived listing | `GET /api/spaces/[id]/memory?include=archived` returns active + cooling + archived (default still active + cooling). |
| GitHub Actions cron | new `.github/workflows/memory-pipeline-cron.yml` fires every 15 min + supports manual `workflow_dispatch`. Vercel Hobby tier is 1 cron/day — out-of-band scheduling via GH Actions sidesteps the cap. Requires repo secrets `CRON_SECRET` + `MEMORY_PIPELINE_URL`. |
| Backfill migration | new `packages/db/neon/migrations/0049_backfill_v1_to_v2_extraction.sql` flips legacy rows `enrichment_status='done' AND enrichment_version=1` back to `pending` so the v2 worker reprocesses them. Apply only after `RELAY_MEMORY_PIPELINE_FULL=true` has soaked on new writes. |
| Docs | DEPLOYMENT.md + `.env.example` updated with the new env vars + GH Actions cron section. |

### Deferred to follow-up PRs (small, contained)

- **Extension UI picker** — touches `control-panel.tsx` + `background/index.ts` + needs chromium-load testing. Server-side `GET /api/spaces` ready for it.
- **Chat hygiene UI** — wire `parseAssistantCommand` into `use-assistant-chat.ts` send() + render cooling/archived pills in `action-result-card.tsx`. Parser + tests ready.
- **App-role RLS swap** — provision `relay_app` + audit 30+ pre-auth flows that legitimately have no viewer GUC. RLS exposure pre-dates v2 — not blocking.

### Phase B (next session) — fresh Neon branch validation

1. `mcp__Neon__create_branch` off prod `br-small-moon-agn70urq` → `memory-v2-bundle-test`.
2. Apply migrations 0040–0049 against fresh branch via `scripts/db-admin.js migrate`.
3. Apply `docs/memory-v2/roles.sql` manually for `relay_worker` provisioning.
4. Verification SQL (re-use `docs/memory-v2/VERIFICATION.sql`).
5. Local web pointed at fresh branch → smoke dashboard, MCP, personal page, embed-only cron, hygiene events.
6. Flip `RELAY_MEMORY_PIPELINE_FULL=true` → write 5 fresh items → manual cron tick → confirm extractors populate observations + entity_relations + bump `enrichment_version` to 2.
7. Apply 0049 backfill → run cron repeatedly → confirm `pending → 0` over time, observations + entity_relations climb, dashboard graph synthetic-hub fallback drops away for old projects.
8. Sample 5 observations + 5 entity_relations — quality check Gemini output.
9. Verify decay-in-ranking moves results (stale vs fresh same-cosine).
10. Final `pnpm -r typecheck` + `pnpm test:stable` + all v2 suites + `pnpm build*`.
11. Update this HANDOFF with snapshot + sample backfill output.
12. Hand to user for `/review 35`.

### Phase B partial — dev-branch schema validation done (2026-05-26)

Fresh Neon branch created off current prod for backfill rehearsal:

| Field | Value |
|---|---|
| Branch name | `memory-v2-bundle-test` |
| Branch ID | `br-cool-field-aganybdc` |
| Parent (prod) | `br-small-moon-agn70urq` |
| Pooled URL | `postgresql://neondb_owner:npg_8BMkX5hrqpji@ep-divine-flower-agvtodh7-pooler.c-2.eu-central-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require` |
| Unpooled URL (migrations) | `postgresql://neondb_owner:npg_8BMkX5hrqpji@ep-divine-flower-agvtodh7.c-2.eu-central-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require` |

Migrations applied: 10 files (0040–0049). Run took seconds.

Verification snapshot (fresh dev branch, real prod-fork data):

| Check | Result |
|---|---|
| Personal spaces == profiles | 73 == 73 ✓ |
| Project spaces == projects | 51 == 51 ✓ |
| space_members rows | 124 (73 personal owners + 51 project memberships) ✓ |
| `memory_items` NULL `space_id` / `lifecycle_state` / `valid_from` | 0 / 0 / 0 ✓ |
| Lifecycle backfill | 461 active + 248 archived = 709 total ✓ |
| 0049 backfill | 709 rows flipped `done → pending`, version=1, ready for v2 extractor ✓ |
| `observations` / `entity_relations` rows | 0 / 0 (extractors haven't run yet) ✓ |
| Partial HNSW indexes (`WHERE embedding IS NOT NULL`) | confirmed on `memory_items.embedding` + `observations.embedding` ✓ |
| `memory_half_lives` seeded | 7 rows ✓ |
| RLS enabled tables | 61 ✓ |
| Lifecycle trigger round-trip | `archived ↔ active` syncs `is_archived` ✓ |
| Personal-space write with NULL `project_id` | works (`dd817aba-...`) ✓ |
| Last migration | `0049_backfill_v1_to_v2_extraction.sql` ✓ |

Prod growth since the initial scoping query: 626 → 709 memory_items (+83), 70 → 73 profiles (+3), 49 → 51 projects (+2) in roughly 6 hours of beta usage.

### Phase B remainder — pending user-driven local smoke

Schema is verified. The remaining Phase B steps (local web boot + extractor run against the 709 backfilled-pending rows + dashboard/MCP/extension/agent smoke) need the user's local Gemini key + auth setup. Recommended next-session checklist:

1. `apps/web/.env.local` — set:
   ```
   DATABASE_URL=postgresql://neondb_owner:npg_8BMkX5hrqpji@ep-divine-flower-agvtodh7-pooler.c-2.eu-central-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require
   DATABASE_URL_UNPOOLED=postgresql://neondb_owner:npg_8BMkX5hrqpji@ep-divine-flower-agvtodh7.c-2.eu-central-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require
   GEMINI_API_KEY=<yours>
   CRON_SECRET=local-dev-secret
   RELAY_MEMORY_PIPELINE_FULL=true
   RELAY_HYGIENE_DRY_RUN=false
   RELAY_PIPELINE_DAILY_USD_CAP=20
   ```
   (Cap raised to $20 for one-shot dev backfill rehearsal — reset to $5 before any prod deploy.)
2. `pnpm --filter @relay/web dev`.
3. Curl the cron route repeatedly until `pending → 0`:
   ```bash
   for i in $(seq 1 35); do
     curl -fsS -X POST -H "Authorization: Bearer local-dev-secret" \
       http://localhost:3000/api/cron/memory-pipeline | jq '{processed: .tick.processed, budget: .budget.spentUsd, fullExtraction: .flags.fullExtraction}'
     sleep 2
   done
   ```
4. Monitor on the dev branch:
   ```sql
   select enrichment_status, count(*) from memory_items group by 1;
   select count(*) from observations;
   select count(*) from entity_relations;
   ```
5. Open `/dashboard` for an old project, confirm graph shows real edges (synthetic-hub fallback drops away once `realEdgeCount ≥ 8`).
6. Open `/personal` — empty state, then write via MCP, then confirm row lands with `project_id=NULL`.
7. Sample 5 observations + 5 entity_relations:
   ```sql
   select id, content, predicate, subject_entity_id, object_entity_id, object_literal, confidence from observations order by random() limit 5;
   select er.id, e1.name as subject, er.relation_type, e2.name as object, er.confidence
     from entity_relations er
     join canonical_entities e1 on e1.id = er.source_entity_id
     join canonical_entities e2 on e2.id = er.target_entity_id
     order by random() limit 5;
   ```
8. If Gemini output looks noisy → iterate prompts in `memory-pipeline-providers.ts` → re-enqueue via `update memory_items set enrichment_status='pending', enrichment_version=1 where enrichment_version=2;` → re-run cron.

When done with the dev branch, drop it:
```
mcp__Neon__delete_branch(projectId='shiny-term-32281581', branchId='br-cool-field-aganybdc')
```

## TL;DR for review

- Schema is layered (episodes → mentions → observations → entity_relations → canon → brief) + bi-temporal + space-scoped.
- The 6 canon memory types stay as the public surface.
- Personal memory is a real first-class space, separate from projects, doesn't count toward project quota.
- Bi-temporal validity + lifecycle state + decay scoring give us "never delete, deprioritize and auto-resurrect on new evidence".
- Worker is wired and shipping with safe defaults (embed-only + dry-run hygiene).
- Migrations applied to a Neon dev branch; production cutover is a separate maintenance-window step.
