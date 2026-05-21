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
- `recall` accepts optional `spaceId`, `includeArchived`, `filters.lifecycleStates`.

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

## What's deferred (next PR)

| Area | Why deferred | Where to land |
|---|---|---|
| Extension space picker UI + auto-route to personal | Extension capture flow is tightly coupled; needs a sidepanel UI pass to expose a "Personal" target alongside the project picker. MCP path already supports personal capture from Claude Code, Cursor, etc. — so personal memory is reachable today via agents, just not the extension. | `apps/extension/src/components/control-panel.tsx`, `apps/extension/src/background/index.ts` around line 4060. |
| Agent chat hygiene hints | UI integration in `components/assistant/chat-view.tsx`. MCP `recall` already returns `lifecycleState`, so the assistant can be prompted to surface stale items today. | `apps/web/src/components/assistant/chat-view.tsx`, `chat-message.tsx`. |
| Archived view: restore button + "Recently resurfaced" tile | Existing memory page has an archived tab; lifecycle-state UX (restore + auto-resurrect explainer) hasn't been bolted on yet. | `apps/web/src/features/memory/*` archived tab + dashboard tile component. |
| Decay multiplier wired into recall ranking | Pure function ready in `decay.ts`; needs hook in the search-path fusion. | `apps/web/src/server/services/memory-service.ts` `searchProjectMemory` and the MCP recall context fusion. |
| Worker full extraction (entities + observations via Gemini) | Cron route currently embeds + sweeps hygiene only. Entity/observation extractor prompts are TBD — design pass + cost gating before flipping `RELAY_MEMORY_PIPELINE_FULL=true`. | `apps/web/src/server/services/entity-extraction-service.ts` (extend or new). Wire callbacks in `/api/cron/memory-pipeline/route.ts`. |

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

## Risks (open)

- **Worker entity/observation extraction is stubbed.** Until the Gemini prompts + cost gates land, the new `observations` and `entity_relations` tables stay empty. Old `postCreateHook` still runs inline so legacy entity_mentions + embeddings keep working — no regression vs prod today.
- **Extension capture still hits `/api/projects/[id]/memory` only.** Personal memory captured via extension would 404 if forced to the new endpoint — that's why the extension path is unchanged in this PR.
- **Dual-path RLS on `canonical_entities` / `entity_mentions` is permissive by design.** A row with non-null `project_id` AND non-null `space_id` authorizes if EITHER predicate passes. Once one stable week confirms nothing reads `project_members` directly anymore, drop the legacy path in a follow-up migration.
- **`forgetting` policy is irreversible after content null.** The MCP `forget` action requires `confirm: true`, but downstream callers (extension, dashboard quick actions) must enforce the same in their UI.

## Production cutover (when ready)

The same migration runner against prod:

```bash
MIGRATION_DATABASE_URL=<PROD_URL> node scripts/db-admin.js migrate
```

Migrations are additive; rollback is `-- DOWN` SQL in each file. Recommended sequence:

1. Snapshot prod, or rely on Neon point-in-time recovery (history_retention_seconds=21600 on this project — 6h).
2. Maintenance window: ~5–10 min (the largest backfill is `memory_items.space_id` over 604 rows on this branch; prod will be larger).
3. Apply migrations.
4. Deploy code from `feat/memory-v2-architecture` (or merged main).
5. Hold off enabling `RELAY_MEMORY_PIPELINE_FULL` until the extractors are designed.
6. Monitor `memory_events` for `cooled` / `restored_auto` activity from the hygiene tick.
7. Decay multiplier hooks land in the next PR — until then recall behaviour is identical to today's.

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

## TL;DR for review

- Schema is layered (episodes → mentions → observations → entity_relations → canon → brief) + bi-temporal + space-scoped.
- The 6 canon memory types stay as the public surface.
- Personal memory is a real first-class space, separate from projects, doesn't count toward project quota.
- Bi-temporal validity + lifecycle state + decay scoring give us "never delete, deprioritize and auto-resurrect on new evidence".
- Worker is wired and shipping with safe defaults (embed-only + dry-run hygiene).
- Migrations applied to a Neon dev branch; production cutover is a separate maintenance-window step.
