# Memory Architecture v2 — Handoff

> **⚠️ ARCHITECTURE PIVOT (2026-05-29): the `spaces` layer was dropped. Personal memory is now a `projects` row with `kind='personal'`.** Everything below the "Current architecture" section describes the **superseded** spaces design and is kept only as historical context. Read the section directly below first; treat the rest as an archive.

## ▶ NEXT-SESSION HANDOFF (2026-05-30) — READ FIRST

**Branch:** `feat/memory-v2-architecture` (PR #35), pushed, HEAD `a008787`. **Plan file:** `~/.claude/plans/plan-fixes-improvements-then-and-robust-reddy.md` (approved; W-task list).

**State:** Memory-v2 pivot (P1–P5) is done, reviewed twice, smoke-tested. An extension-UX batch is partly landed. **Everything ships in #35 before cutover** (user decision). These are the last pushes before prod cutover.

**Done (committed + pushed):**
- Pivot P1–P5 + review fixes + enum-cast fix.
- **W1** cutover verified LIVE on a prod-fork branch with the real prod key: 80 profiles → 80 personal projects (exactly one each), 0 missing owner member rows, personal excluded from the project limit. Cutover is safe.
- **W9** personal surfaced in all 4 places: extension picker (pinned), web dashboard switcher (pinned, never the default), MCP `list_projects` (`?includePersonal=true`), agent in-process client.
- **W4** inline auto-capture row simplified (label + functional On/Off). **W7** expand→chevron. **W5(partial)** add-memory composer bg fixed.
- **`manual` source surface** added end-to-end; **every memory item now shows a source badge** (web `OriginBadge` + `ProvenanceChip` default unknown→Manual; extension manual adds stamp `sourceSurface:"manual"`).
- Source/timestamp/recency **already exists** in the web `memory-item-card` (OriginBadge + relative time + decay) — do NOT rebuild it.

**Shipped this session (committed + pushed to #35):**
- **W5-ext** ✓ (`31fdb67`). Widened `RelayContextPreviewItem` with `sourceSurface`/`capturedAt` (already present at runtime from `buildProjectContextItems`); decision/constraint/task items now render a source badge + relative time (`ContextItemMeta`), sorted by recency in the background builder. Notes CRUD parity (inline edit + add composer, `pinned:true`). Scrollable `.contextTabs` + a Notes tab.
- **W2** ✓ (`10b3230`). Data model: `autoCapturePlatforms`/`inlineChip`/`inlineChipPlatforms` on `ProjectSettings` (db type, zod schema w/ per-key null-clear, service, both DTOs). Threaded `getProjectSummaries → /api/extension/session → RelayProjectOption → background projectOptions`. New shared resolvers `effectiveAutoCapture/effectiveInlineChip` (`packages/shared/src/utils/capture-settings.ts`) + 7 unit tests. Background capture gate now resolves by `(active project × page platform)`.
- **W3** ✓ (`dd8fa68`). Settings UI: two chevron tri-state trees (`CaptureMatrixTree`) for auto-capture + inline-chip — global → projects (Personal pinned first) → platforms; node state on/off/indeterminate derived from subtree; project node clears its leaves, leaf writes the platform map. Inline-chip now drives the in-page chip via background `showCue = effectiveInlineChip(...)`. Retired the unused `enabledPlatforms` capture/chip gate. **Live UI verification still pending** (needs a Chrome load) — flagged for review; tri-state rollup semantics (esp. the main global node display vs non-destructive global write) may want a visual iteration.

**Remaining W-tasks (deferred — both need a running browser):**
1. **W8 — in-page edge save/detach button** (content script). The in-page UI lives in `apps/extension/static/relay-content.js` (a readable 3343-line hand-written IIFE with its own `relayChipState`/`activeState`, association-toast renderer, chip lifecycle, SPA-nav handling) — NOT the `background/index.ts:3965` `relaySaveToastInPage` injection (that's a one-shot `executeScript` toast). The button belongs in `relay-content.js`: persistent, shadow-DOM-isolated, `pointer-events:auto`, hooked to `activeState.chatAssociation.status`. Unsaved→Save&link (send a `RELAY_*` message → background `associateCurrentChat`); saved→Detach/unlink WITH confirmation (background `updateChatAssociation(true)`/`archiveChatAssociation`); one-time dismissable X (persist per chat); NO green border. Retire the side-panel half-circle. New content-script DOM surface → Chrome listing re-disclosure. **High blind-build risk** (third-party-page injection) — do this with eyes-on.
2. **W6 — double-scroll** (`.module.css` `.expanded`:92 vs `.contextItemListScroll`:736 nested overflow). Needs eyes-on — fix in a live pass.

**Then: cutover** — see "Production cutover" below (migrations `0040`–`0050` to prod, `CRON_SECRET`, embedding-backfill loop, `RELAY_MEMORY_PIPELINE_FULL=true` + `RELAY_HYGIENE_DRY_RUN=true` for a week). Soak `RELAY_PERSONAL_MEMORY_AUTOWRITE` (log-only) before flipping personal-routing on. Chrome resubmission after W8.

**Dev branch for testing:** `br-muddy-morning-ag55csrg` (prod fork, migrations `0040`–`0050` applied, 80 profiles backfilled). Existing rows are prod-encrypted → need the prod key to decrypt.
- Pull it (Vercel CLI is logged in as `alimkhan`): `vercel env pull /tmp/p.env --environment=production --yes`, extract `RELAY_CONTENT_ENCRYPTION_KEY`, **shred the dump**.
- Build a throwaway `apps/web/.env.local` from the user's root `.env.local` overriding `AUTH_PROVIDER=local`, `DATABASE_URL`/`LOCAL_DATABASE_URL`=branch pooled URL, + the prod `RELAY_CONTENT_ENCRYPTION_KEY`. Boot `pnpm --filter @relay/web dev`; auth via `POST /api/auth/local {email:"alimkhan.ergebayev@gmail.com"}` (browser/Playwright sets the cookie). Teardown: rm `apps/web/.env.local`, kill server. Only touch Alim's account + a smoke project.

### Paste-ready prompt for the next session
```
Continue PR #35 (feat/memory-v2-architecture) — final extension-UX pushes before prod cutover. W5-ext, W2, W3 are SHIPPED (commits 31fdb67/10b3230/dd8fa68). Read docs/memory-v2/HANDOFF.md "NEXT-SESSION HANDOFF" + the plan at ~/.claude/plans/plan-fixes-improvements-then-and-robust-reddy.md first. Do this session WITH a live browser (both remaining tasks need eyes-on): (1) W8: in-page edge save/detach button in apps/extension/static/relay-content.js (persistent, shadow-DOM, hooked to activeState.chatAssociation.status; unsaved→Save&link, saved→Detach-with-confirm, one-time dismissable X, no green border; retire the side-panel half-circle); (2) W6: double-scroll live pass (.expanded vs .contextItemListScroll). Also eyes-on review W3's tri-state trees (live UI was not verified when built). Bundle into #35; cutover after. Commit per workstream, typecheck + extension build + test:stable after each, push. For live testing use dev branch br-muddy-morning-ag55csrg with the prod RELAY_CONTENT_ENCRYPTION_KEY (vercel env pull, shred dump, throwaway apps/web/.env.local, only Alim's account + a smoke project). W8 adds a content-script surface → Chrome listing re-disclosure before resubmission. Caveman mode is on.
```

## Current architecture (post-pivot) — authoritative

**Branch:** `feat/memory-v2-architecture` · **Project:** `shiny-term-32281581` · prod branch `br-small-moon-agn70urq`.

### Why the pivot

Planning personal-space parity (brief/state/digest) revealed that `spaces` was ~90% redundant with `projects`: every project already had a 1:1 backing project-space doing no autonomous work, and personal was the only genuinely distinct case (single-owner). Rather than widen the two largest services (bootstrap + digest) to be space-aware, **personal became a `projects` row with `kind='personal'`** — so the entire existing project pipeline (brief / state / digest / canon / sources / graph) serves personal for free. The `spaces`, `space_members`, every `space_id` column, `is_space_member` RLS, `SpaceRepository`, `set_current_space`, and `/api/spaces*` are all gone. `project_id` is `NOT NULL` everywhere. Future team/shared scoping, if it comes, will be a *projects* feature, purpose-built.

### What shipped (commits on this branch, newest last)

| Phase | Commit | Summary |
|---|---|---|
| P1 | `d5bb681` | **Migrations reshaped in place.** `0040_spaces.sql`→`0040_personal_projects.sql` (adds `projects.kind` + partial-unique `(owner_id) WHERE kind='personal'` + backfills one personal project + owner `project_members` row per profile). New `0044_entity_rls.sql` (project-keyed RLS for `canonical_entities` + `entity_mentions`). Deleted `0044_space_id_backfill`, `0047_nullable_project_id`, `0051`. `0041/42/43/46/48/50`: `space_id`→`project_id`, dropped space indexes + the entity_mentions dual-path. |
| P2 | `4973285` | **Code collapse.** Deleted `SpaceRepository` + `/api/spaces*`. Repointed observation/entity-relation/graph/memory repos + worker from `space_id`→`project_id` (`getSpaceGraphSnapshot`→`getProjectGraphSnapshot`, `getSpaceContext`→`getProjectContext`, `listBySpace`→`listByProject`). `project-repository` gained `ensurePersonalProject`/`getPersonalProject`; `listByOwner({includePersonal})` (default false) so personal never leaks into pickers/billing; active-quota count excludes `kind='personal'`. `reconcileProfileForAuthUser` ensures the personal project on bootstrap. `/personal` redirects to the shared `/dashboard`. MCP dropped `set_current_space`/`spaceId`. `ProjectRow`/`MemoryItemRow`/`CreateMemoryItemInput` dropped `spaceId`; `project_id` NOT NULL. |
| P3 | `a7a3677` | **Selective personal memory** (`personal-memory-service.ts`). `classifyPersonalSalience()` — Gemini extractor (reuses `runGeminiJsonWithFallback` + a budget gate) keeps only durable user-centric facts (identity/preference/work/skill/goal/constraint/relationship/health), rejects transient + project-technical. `decidePersonalCrud()` — mem0-style ADD/NOOP via `resolveMemoryConflict` (no second engine; supersession delegated to the worker). `routePersonalMemory()` — fire-and-forget; the capture route runs it only on `routingHint:"auto"`, project capture stays primary. **Soak: writes gated by `RELAY_PERSONAL_MEMORY_AUTOWRITE=true` AND `confidence >= 0.7`; otherwise logged via `logServerEvent`, never written.** 12 unit tests. |
| P4 | `20afa1e` | **Clients surface personal as a project.** `ProjectSummaryDto`/`RelayProjectOption` gain optional `kind`, threaded `listByOwner`→`getProjectSummaries`→`listProjectsForUser`→`listCachedProjectsForUser` (cache key varies on `includePersonal`). `/api/projects?includePersonal=true` + extension session/auth routes include personal; auto-select + empty-state count only non-personal (no leak). Extension control-panel drops the `/api/spaces` fetch + `personalSpaceId`; personal derives from `projectOptions.kind`, pinned at the top of the picker, manual captures post to its normal project endpoint (no routingHint — manual wins). Assistant agent's in-process client lists personal (with `kind`) so it can route durable facts there. |
| P5 | `b39e92a` | Test-assertion fixes for `includePersonal`; this doc. |

### Verification (this work)

| Check | Result |
|---|---|
| Reshaped migrations on a fresh Neon branch off prod (`br-old-resonance-agvka18i`) | 10 files applied clean, no errors |
| Personal projects == profiles | **78 == 78** |
| Personal projects missing owner `project_members` row | **0** |
| Profiles with ≠1 personal project | **0** |
| `space_id` columns anywhere / `spaces`+`space_members` tables | **0 / 0** |
| `project_id` NOT NULL on `observations` / `entity_relations` / `memory_items` | NO / NO / NO (all NOT NULL) |
| `pnpm -r typecheck` | clean across all workspaces |
| Extension `plasmo build` | succeeds |
| `pnpm test:stable` | 75 passed |
| New + touched suites (personal-memory 12, worker/mcp 19, project-queries/mapper/routing/auth) | green |
| Full `pnpm test` | 642 passed / **12 pre-existing failures** unrelated to this work (sidebar "No QueryClient", dashboard-page "DATABASE_URL", sign-in, mcp client/project-detection, dashboard-content, project-context dedup — none reference `kind`/`spaces`/`personal`; none of their source or tests are in this branch's diff) |

### New env var

| Var | Default | Effect |
|---|---|---|
| `RELAY_PERSONAL_MEMORY_AUTOWRITE` | unset (log-only) | When `true`, auto-routed personal facts at `confidence >= 0.7` are written to the personal project. Otherwise every candidate is logged (`memory.personal_fact_skipped`), never written — soak mode. Promote to `true` only after the logged sample looks clean. |

### Known follow-ups

- **`routingHint:"auto"` has no extension trigger yet.** The server path (P3) is wired and consumed by `POST /api/projects/[id]/memory`, but the extension's conversation auto-capture flows through the *digest/session* pipeline, not a direct memory POST. Routing durable personal facts out of the worker/digest is the natural next step (the worker already runs over every project, personal included).
- **Personal-memory salience prompt needs a soak** before flipping `RELAY_PERSONAL_MEMORY_AUTOWRITE=true` — same discipline as the v2 extractor soak. Sample the `memory.personal_fact_skipped` logs first.
- **Local UI Playwright pass** (`/personal` renders the full project dashboard; project dashboards unregressed) is the remaining manual gate — needs the dev server pointed at a fresh branch + local auth.
- **Re-review** PR #35 after the reshape — the diff shrank substantially (spaces machinery deleted) but the net change is large.

---

# ARCHIVE — superseded spaces design (pre-pivot)

Everything below predates the 2026-05-29 pivot and describes the dropped `spaces` layer. Kept for historical context only — **do not implement against it.**

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
- **Worker `processItem` is not transactional across its extraction loop.** If the worker throws mid-item (e.g. embed succeeds, then an `observation_created` event INSERT fails), the observations/entity_mentions/entity_relations inserted *earlier in the same item's loop* stay committed while the row flips to `enrichment_status='failed'`. A retry re-runs extraction from the same content and re-inserts: `entity.findOrCreateBySpace` is idempotent, but `observation.create` and `entity.addMention` are **not**, so duplicates accumulate on each retry. Low-probability today (Gemini extraction is mostly deterministic + the failure window is narrow), but the correct fix is to wrap the per-item work in a single DB transaction (or per-observation savepoints). Deferred to a follow-up to avoid widening the cutover diff. Tracking: F6 (post-cutover).

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

**Keep the dev branch alive** until /review 35 + all follow-up PRs are merged
and prod cutover is verified — re-use it for spot checks. Drop only after
production is healthy:
```
mcp__Neon__delete_branch(projectId='shiny-term-32281581', branchId='br-cool-field-aganybdc')
```

## Phase B complete — local extractor smoke (2026-05-27)

Local validation against dev branch `br-cool-field-aganybdc` uncovered four
in-scope defects in PR #35 that were silently blocking the extractor + a
pre-existing prod outage in the legacy embedding flow. All five fixed in this
commit set.

### 1. Gemini embedding model deprecated

Google deprecated `text-embedding-004` on 2026-01-14. Both the single
(`embedContent`) and batch (`batchEmbedContents`) endpoints started returning
404 for that model name. The `postCreateHook` in `memory-service.ts` calls
embedding via `void embedMemoryItem(...)` — fire-and-forget; the rejection was
swallowed and never reached PostHog. Result: **every memory_item created since
~2026-03-25 landed without an embedding**. Recall has been silently
lexical-only for two months.

Audit on prod branch `br-small-moon-agn70urq`:

| Table | Rows | Without embedding |
|---|---|---|
| `memory_items` | 709 | **709** (all NULL) |
| `canonical_entities` | 110 | **110** (no writer wired — distinct issue, see §3) |
| `source_chunks` | 674 | **674** (same `text-embedding-004` failure) |

PostHog has **zero** `$exception` events matching `embedding`/`text-embedding`/
`embedContent` over the past 14 days. The fire-and-forget pattern hid this
completely.

**Fix** (`apps/web/src/server/services/embedding-service.ts`):
- `EMBEDDING_API_MODEL` → `gemini-embedding-001`.
- `EMBEDDING_MODEL` tag bumped to `gemini-embedding-001:rd-768` so
  `getItemsWithStaleEmbeddingModel` re-claims any future legacy rows.
- Added `outputDimensionality: 768` to BOTH `embedContent` and
  `batchEmbedContents` request bodies (gemini-embedding-001 defaults to 3072 —
  schema is `vector(768)` everywhere; without this the DB rejects with
  `expected 768 dimensions, not 3072`).
- Used Matryoshka Representation Learning truncation rather than re-sizing the
  pgvector columns, so existing HNSW indexes stay valid.

### 2. Worker SQL casts (postgres parameter type inference)

The Neon serverless driver sends parameters untyped; Postgres can't always
infer types from context when the column appears on the LHS or inside
`jsonb_build_object`. Three v2 SQL sites failed with
`could not determine data type of parameter $5`:

| File | Site | Cast added |
|---|---|---|
| `packages/db/src/repositories/observation-repository.ts` | `INSERT INTO observations` (subject_entity_id NULL) | `$1::uuid` through `$12::text` |
| `packages/db/src/repositories/entity-relation-repository.ts` | `INSERT INTO entity_relations` | `$1::uuid`..`$9::jsonb` |
| `packages/db/src/repositories/entity-relation-repository.ts` | `UPDATE entity_relations` in `invalidateCurrentForSubjectPredicate` | `$5::timestamptz`, `$6::text`, etc. |
| `packages/workers/memory-pipeline/src/index.ts` | `INSERT INTO memory_events ... 'observation_created'` | `$5::double precision`, `$6::boolean`, `$1-3::uuid` |

These are not "production might also break" — these only ever fire under v2
extractor flow which is off in prod today.

### 3. New embedding-backfill API route

`apps/web/src/app/api/cron/embedding-backfill/route.ts` (new) — handles all
three pgvector tables. Same Bearer-token auth as the memory-pipeline cron.

Query params:
- `?table=memory_items|canonical_entities|source_chunks|all` (default `all`)
- `?limit=N` (default 50, max 500)

Returns per-table `{ embedded, remaining }`. Embed text per table:
- `memory_items`: `title + ": " + content` via existing `embedMemoryItems`.
- `canonical_entities`: `name (kind)` — table has **no** `embedding_model`
  column (schema gap predating v2; left as-is for this PR), so the route
  re-embeds only `WHERE embedding IS NULL`.
- `source_chunks`: `content`. Re-embeds `WHERE embedding IS NULL OR
  embedding_model <> 'gemini-embedding-001:rd-768'`.

This is the single tool the operator runs after prod cutover (see §5 below).

### 4. Dev validation results (against `br-cool-field-aganybdc`)

After patches landed:

| Check | Result |
|---|---|
| Worker tick 1 (no embed needed, items pre-embedded by route) | 25/25 done, 51 ent + 50 obs + 0 rel, $0.06 |
| Worker tick 2 (embeds inline, then extracts) | 25/25 done, 49 ent + 66 obs + **1 rel**, $0.06 |
| `embedding-backfill` route, all 3 tables, limit=50 | 50/50 each, 70 sec total |
| Observation quality (8 random) | All semantically coherent SVO triples; abstract subjects fall back to `object_literal` (correct behaviour); confidence 0.9–1.0 |
| Entity relation example | `FastAPI -supports-> Server-Sent Events` (1.0) |

Entity relations are sparse (~1 per 50 items). Worker only creates a relation
when **both** subject and object resolve to canonical entities; most facts
have one named subject and a non-entity object. Architectural choice, not a
bug — worth a future prompt-engineering pass if we want a denser graph.

### 5. Post-deploy backfill procedure (you run this after merging PR #35)

After deploying the merged branch and applying migrations 0040–0049 to prod:

1. **Set `CRON_SECRET`** in Vercel env (required — cron + backfill routes fail
   closed without it).
2. **Backfill embeddings, all 3 tables**, 50 rows at a time. Run from a
   developer machine with `CRON_SECRET` exported:
   ```bash
   while :; do
     out=$(curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
       "https://onrelay.app/api/cron/embedding-backfill?table=all&limit=50")
     echo "$out" | jq '.tables'
     rem=$(echo "$out" | jq '[.tables[].remaining] | add')
     [ "$rem" = "0" ] && break
     sleep 1
   done
   ```
   Watch the per-table `remaining` counters drop to 0. Expected total:
   `709 + 110 + 674 = 1493` rows × 1 Gemini call each ≈ $0.20 at current
   pricing. The route is idempotent — safe to re-run.
3. **Verify**:
   ```sql
   SELECT 'memory_items',       COUNT(*) FILTER (WHERE embedding IS NULL) FROM memory_items
   UNION ALL SELECT 'canonical_entities', COUNT(*) FILTER (WHERE embedding IS NULL) FROM canonical_entities
   UNION ALL SELECT 'source_chunks',      COUNT(*) FILTER (WHERE embedding IS NULL) FROM source_chunks;
   ```
   All three should be 0.
4. **Apply migration 0049** (`backfill_v1_to_v2_extraction.sql`) to flip
   legacy `done/v=1` rows back to `pending` so the v2 worker picks them up.
   Already in the migration set — applies automatically when you run the
   migration runner.
5. **Set `RELAY_MEMORY_PIPELINE_FULL=true`** + `RELAY_HYGIENE_DRY_RUN=true`
   (keep dry-run for the first week of hygiene observations). The Vercel
   cron or GH Actions cron will start draining the v2 extraction queue.
6. **Watch** `memory_events` for `observation_created` + `entity_relation_*`.
   Sample 10 rows after the first 100 items drained; sanity-check Gemini
   output before flipping `RELAY_HYGIENE_DRY_RUN=false`.

### 6. Open: other emptiness audit on prod

Quick `information_schema` sweep on `br-small-moon-agn70urq` (zero-row public
tables that aren't obviously feature-flagged off):

| Table | Reason it's empty | Action |
|---|---|---|
| `memory_relations` | Legacy v1; superseded by `entity_relations`. | None — leave; PR #35 doesn't read it. |
| `context_packets` | Feature surface never wired? | Flag for a follow-up audit; not blocking. |
| `provider_counter_snapshots` | Aggregation table, populated by a cron we may not have running. | Audit separately. |
| `project_settings` / `project_state_overrides` | User-driven; only writes on opt-in actions. | Expected. |
| `referral_rewards` | No payout has fired yet. | Expected. |
| `source_external_citations` | Sources have external citations only if Gemini tags them; pre-existing. | Out of scope. |

Embedding columns on `canonical_entities` are populated by the new
backfill route but no production writer wires them on-create. Logging that
as a follow-up: extend `EntityRepository.findOrCreate*` to embed-on-insert
(small change, ~10 lines).

### 7. Final dev-branch drain stats (2026-05-27)

After all five fixes landed, full drain of the 709 backfilled-pending rows
on `br-cool-field-aganybdc`:

| Metric | Value |
|---|---|
| `memory_items` processed | **710 / 710 done v=2** (incl. 1 personal-space row after mapper fix) |
| Observations created | **1742** (all embedded) |
| Entity relations | **18** (sparse — see §4) |
| Canonical entities created this session | **990** |
| `memory_events.observation_created` | **1616** |
| `memory_events.restored_auto` | **556** (hygiene resurrected items on new evidence — the loop works) |
| `memory_events.cooled` / `archived` / `expired` | 30 / 94 / 36 |
| Gemini spend | ~$1.71 over ~80 min (27 worker ticks @ 25 batch) |
| Drain errors | 0 |

## What's left for you (workflow to merge + cutover)

The bundle is code-complete and locally validated against a real prod fork.
The next steps are **gated on /review 35** plus a small set of follow-up PRs
that we deliberately scoped out of #35 to keep the diff reviewable.

### Step 1 — `/review 35`

Run review on this PR. Apply review fixes on `feat/memory-v2-architecture`
(or new commits — your call). Re-typecheck + re-run `pnpm test:stable` + the
v2 suite after each fix.

### Step 2 — Build the five deferred follow-up PRs (each branched from updated `main`)

| PR | Scope | Key files |
|---|---|---|
| **F1 Extension space picker** | Two-level picker (Personal + projects) in the side-panel; personal capture routes to `/api/spaces/[id]/memory`. Server endpoint already ships in #35. | `apps/extension/src/components/control-panel.tsx` (~2570 lines), `apps/extension/src/background/index.ts` (~120 state, ~4118 write) |
| **F2 Chat hygiene UI** | Wire `parseAssistantCommand` into `use-assistant-chat.ts` `send()`; render cooling/archived pills in `action-result-card.tsx`. Parser + 19 tests already in #35. | `apps/web/src/components/assistant/use-assistant-chat.ts`, `action-result-card.tsx` |
| **F3 App-role RLS swap** | Provision `relay_app` (least-priv non-owner) via `docs/memory-v2/roles.sql`; audit ~30 pre-auth flows that have no viewer GUC; move app `DATABASE_URL` off `neondb_owner`. Pre-dates v2 but surfaced by the v2 review. | `docs/memory-v2/roles.sql`, prod env, ~30 route files |
| **F4 `canonical_entities` embed-on-insert** | Extend `EntityRepository.findOrCreate*` to embed `name (kind)` on first write. Today they land embeddings only via the backfill route. ~10 lines. | `packages/db/src/repositories/entity-repository.ts` |
| **F5 Other-emptiness audit** | Investigate `context_packets`, `provider_counter_snapshots`, `source_external_citations`. Either delete dead tables or wire missing writers. Non-blocking. | scattered |

### Step 3 — `/review` each follow-up PR

Same loop — review, fix, re-test.

### Step 4 — Final end-to-end test on dev branch

Re-use `br-cool-field-aganybdc` (do **not** drop yet). Point a local web at it,
exercise: extension capture (post-F1), chat commands + pills (post-F2),
ranking under decay, MCP `recall` + `manage_memory` round-trips, personal vs
project space isolation.

### Step 5 — Merge to `main`

Squash or merge — whichever your repo convention is.

### Step 6 — Production cutover

Follow §"Production cutover" lines 237–254 + §5 backfill loop above. Sequence
once more for clarity:

1. Snapshot prod (or rely on Neon PITR — `history_retention_seconds=21600`).
2. Apply migrations `0040`–`0049`.
3. Deploy merged `main`.
4. Set `CRON_SECRET` in Vercel env.
5. Run the embedding-backfill loop until all three `remaining` counters hit 0.
6. Set `RELAY_MEMORY_PIPELINE_FULL=true` + keep `RELAY_HYGIENE_DRY_RUN=true`.
7. Watch `memory_events` for one week. Sample 10 obs after first 100 drained.
8. Flip `RELAY_HYGIENE_DRY_RUN=false`. Drop `RELAY_PIPELINE_DAILY_USD_CAP` to `5`.

### Step 7 — Drop dev branch

Only after prod is healthy:
```
mcp__Neon__delete_branch(projectId='shiny-term-32281581', branchId='br-cool-field-aganybdc')
```

## Deferred features — schedule AFTER prod cutover + Chrome resubmission

**Do NOT bundle into PR #35. These ship as separate small PRs once the cutover is stable + the extension is back in the Chrome Web Store with the W3 privacy patches.**

### F7 — Edge quick-save button (browser-edge half-circle)

Half-circle floating action button glued to the viewport edge on supported AI chat sites. One tap saves the current selection / latest chat turn without opening the side panel. Toggleable off in both extension settings AND dashboard settings (same flag, two surfaces).

- Lives in a shadow-DOM widget so AI sites' z-index doesn't break it.
- Displays the currently-active target as a chip on hover ("→ Personal" / "→ {ProjectName}") so user sees the destination before tapping.
- Adds another content-script DOM injection → re-tighten Chrome listing disclosure before submitting. Plan to ship AFTER current resubmission lands so we don't reset the reviewer clock.
- Settings flag: `relay.settings.showEdgeQuickSave` (default `true`); per-user, syncs via existing settings table.

Scope: ~1 day. Single content script + settings toggle.

### F8 — Per-target auto-capture toggle (tri-state aware)

Auto-capture becomes a setting per `space_id` instead of a global bool. Some projects ON, others OFF, Personal OFF — fully independent.

- Storage: extension `autoCaptureBySpace: Record<spaceId, boolean>` map replaces the current `autoCapture: boolean`.
- Background capture path reads `autoCaptureBySpace[currentTargetSpaceId]` on each gate check.
- UI: settings page lists one row per available space with its own toggle; top-level summary chip shows "Auto-capture: 3/5 projects + Personal off" instead of a tri-state checkbox (tri-state UX hazard).
- Migration: one-time hop — existing `autoCapture=true` users get `autoCaptureBySpace = { [everySpaceId]: true }`.

Scope: ~half day. Storage shape change + settings UI + capture-gate read.

### F9 — Personal-as-just-another-project + heuristic routing

**Redesign of F1 (already shipped in PR #35).** F1 today treats Personal as a special top-level pinned row with a separate `personalMode` flag. F9 promotes Personal to "just another row in the same picker list" + adds content-based heuristic routing for AI-chat captures.

**Routing decision matrix (today vs target):**

| Capture source | Today (F1) | Target (F9) |
|---|---|---|
| Extension manual save | Explicit picker target (Personal pinned at top) | Same picker, Personal as just a row |
| Extension auto-capture | Same explicit target | **Heuristic:** content-classifier picks Personal or best-matching project; user can re-route via "Move to..." after the fact |
| MCP `add_memory` | Explicit `spaceId` arg | Explicit arg still wins; fallback to heuristic when omitted |
| Right-click "Save to Relay" | Explicit picker target | Same picker (no heuristic — user is acting deliberately) |
| Agent chat | Currently-active project | Heuristic when agent doesn't pass an explicit target |

**Heuristic primitives (cheap, server-side):**
- Embed the captured text once.
- Cosine-similarity against the embedding centroid of each space's recent memory_items. Highest hit wins if above a confidence floor.
- Below the floor → fall back to currently-active project (preserves F1 behavior as the safety net).
- Cache centroids in `memory_half_lives`-style table, refresh on a slow cron.

**Personal UI parity with project dashboard.** Today `/personal` is just a card list. F9 brings the same surfaces project pages have:
- Brief generation (deterministic + Gemini, both already wired for projects).
- Activity feed (memory_events filter by space_id).
- State derivation (objective / decisions / tasks rollup — same `project-state-service` logic, just scoped to space).
- Graph view (`getSpaceGraphSnapshot` already exists — point the existing `memory-graph-utils` at it for personal).
- Sources tab (already space-scoped via 0044 backfill).
- Tabs by memory type (decisions/tasks/constraints/notes/etc).

**Code surfaces touched:**
- `apps/web/src/app/(workspace)/personal/page.tsx` — expand from card list to full project-style page.
- `apps/extension/src/components/control-panel.tsx` — remove `personalMode` flag, treat Personal as a regular `RelayProjectOption` with `kind: "personal"`. Picker drops the pinned-top placement.
- New `apps/web/src/server/services/space-routing-service.ts` — heuristic classifier.
- New `apps/web/src/app/api/spaces/[id]/{brief,state,activity,sources}/route.ts` mirrors of the project endpoints.

Scope: 2–3 days. The biggest of the three deferred items because it touches everything that's project-shaped today.

### Order recommendation

1. Cutover PR #35 first.
2. Chrome resubmission → wait for store approval.
3. F8 (smallest, no Chrome surface change).
4. F9 (biggest, but logically before F7 because F7 needs the per-row picker F9 introduces).
5. F7 (quickest UX win once F9 lands).

## Local verification recipe (next session — use Playwright + Neon MCP)

For the next session AI agent: this is the kickoff playbook for testing PR #35 + everything stacked on it.

### Prereqs

- Repo at `feat/memory-v2-architecture` (`git pull --rebase`).
- Dev branch alive: `br-cool-field-aganybdc` (Memory v2 fork of prod). Connection strings in §"Phase B partial" above.
- Local Gemini API key in root `.env.local` already.

### Step 1 — point local web at the dev branch

`apps/web/.env.local` (create if missing):

```
NEXT_PUBLIC_RELAY_APP_URL=http://localhost:3001
NEXT_PUBLIC_POSTHOG_KEY=<from root .env.local>
NEXT_PUBLIC_POSTHOG_HOST=<from root .env.local>
GEMINI_API_KEY=<from root .env.local>
DATABASE_URL=postgresql://neondb_owner:npg_8BMkX5hrqpji@ep-divine-flower-agvtodh7-pooler.c-2.eu-central-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require
DATABASE_URL_UNPOOLED=postgresql://neondb_owner:npg_8BMkX5hrqpji@ep-divine-flower-agvtodh7.c-2.eu-central-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require
CRON_SECRET=local-dev-secret
RELAY_MEMORY_PIPELINE_FULL=false
RELAY_HYGIENE_DRY_RUN=true
RELAY_PIPELINE_DAILY_USD_CAP=20
```

### Step 2 — boot

```bash
pnpm install
pnpm -r typecheck
pnpm test:stable
pnpm --filter @relay/web dev   # background; ready in ~15s on port 3001 (3000 may be in use)
```

### Step 3 — D-step verification via Playwright + Neon MCP

| Step | Action | Tool |
|---|---|---|
| D.1a | Confirm 0050 index covers ORDER BY created_at on dev branch | `mcp__Neon__explain_sql_statement` — see HANDOFF §"Phase B complete" for the exact query |
| D.1b | Typecheck + tests | Bash — `pnpm -r typecheck && pnpm test:stable` |
| D.2 | Fix 1 round-trip (W1 ordering trap defense) | Insert one personal-space memory_item via `mcp__Neon__run_sql` → curl `/api/cron/memory-pipeline` with FULL=false → confirm row stays `pending@v=0, embedding NOT NULL` → flip FULL=true → re-curl → confirm `done@v=2` + observations + entities |
| D.3 | patchMany concurrency cap | MCP `manage_memory` bulk archive 20 IDs → log scan for in-flight PATCH count ≤ 8 |
| D.4 | Entity-name render | MCP `recall({include:["entities"]})` → response contains `name —[predicate]→ name`, no UUIDs |
| D.5 | Backfill route smoke | `curl -X POST -H "Authorization: Bearer local-dev-secret" "http://localhost:3001/api/cron/embedding-backfill?table=all&limit=10"` |
| D.6a | Privacy page renders W3 additions | `curl http://localhost:3001/privacy \| grep -oE "Single Purpose\|audioCapture\|remote code\|Delete account"` — expect 4 hits |
| D.6b | Personal page renders new card | Playwright MCP: sign in, navigate `/personal`, screenshot. Confirm source badge + timestamps + icon actions render |
| D.6c | Continue button appears at step cap | Playwright: open agent chat, ask a task that needs > {plan_max_steps} tool calls, screenshot the "Continue" button on the cap-hit message |
| D.6d | Extension picker shows "Personal" | Manual: `chrome://extensions` → Load unpacked → open side panel → confirm Personal pinned above projects (F1 today; will move to a row in F9) |

### Step 4 — extension auto-capture smoke on a real AI site

1. Load extension into Chrome (Developer mode → Load unpacked → `apps/extension/build/chrome-mv3-dev`).
2. Sign in via the extension popup.
3. Toggle on capture, pick a project target.
4. Open ChatGPT or Claude in a tab, have a short conversation about the project.
5. Check `/api/projects/{id}/memory?limit=50` returns the new turn-derived items.
6. Switch the picker to Personal. Have an unrelated conversation. Confirm the new captures land at `/api/spaces/{personalSpaceId}/memory`.

### Step 5 — sample Gemini extraction quality

After D.2 sets FULL=true and the worker drains a few items, sample randomly:

```sql
SELECT id, content, predicate, subject_entity_id, object_entity_id, object_literal, confidence
FROM observations ORDER BY random() LIMIT 5;

SELECT er.id, e1.name AS subject, er.relation_type, e2.name AS object, er.confidence
FROM entity_relations er
JOIN canonical_entities e1 ON e1.id = er.source_entity_id
JOIN canonical_entities e2 ON e2.id = er.target_entity_id
ORDER BY random() LIMIT 5;
```

If output looks noisy, iterate prompts in `apps/web/src/server/services/memory-pipeline-providers.ts`, re-enqueue via `update memory_items set enrichment_status='pending', enrichment_version=1 where enrichment_version=2;`, re-curl the cron.

### Step 6 — tear-down between sessions

- `TaskStop` the dev server background task.
- Optionally `mcp__Neon__run_sql_transaction` to delete any test rows you inserted.
- Restore `.env.local` if you backed it up.

**Do not drop the dev branch until prod cutover is verified healthy.**

## TL;DR for review

- Schema is layered (episodes → mentions → observations → entity_relations → canon → brief) + bi-temporal + space-scoped.
- The 6 canon memory types stay as the public surface.
- Personal memory is a real first-class space, separate from projects, doesn't count toward project quota.
- Bi-temporal validity + lifecycle state + decay scoring give us "never delete, deprioritize and auto-resurrect on new evidence".
- Worker is wired and shipping with safe defaults (embed-only + dry-run hygiene).
- Migrations applied to a Neon dev branch; production cutover is a separate maintenance-window step.
