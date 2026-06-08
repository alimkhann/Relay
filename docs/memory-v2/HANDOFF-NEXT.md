# Next-session handoff — Phase 4 complete; next: review → cutover tooling → rollout

Branch `feat/memory-v2-architecture` (PR #35).

## START HERE (next session): review, then Phases 5–6

**Phase 1 (cost-cut merge), Phase 2 (extension bg decomposition), and Phase 3
(cost-safe memory-v2 scheduling), and Phase 4 (real evidence graph) are DONE.** Constraints still hold: do NOT deploy, touch
prod Neon, flip prod flags, or delete branches without explicit approval. Keep
`RELAY_PERSONAL_MEMORY_AUTOWRITE` / `RELAY_MULTI_PROJECT_CAPTURE` /
`RELAY_MEMORY_PIPELINE_FULL` dark.

### Phase 3 completed

- Removed `.github/workflows/memory-pipeline-cron.yml`. `/api/cron/memory-pipeline`
  is manual/operator-only; existing daily `/api/internal/jobs/cron` is bounded recovery.
- Added migration `0053_cost_safe_memory_scheduling.sql`: durable
  `memory_pipeline_jobs`, `projects.next_hygiene_at` / `last_hygiene_at`, and due indexes.
- Memory create/update/batch/personal writes enqueue idempotent enrichment jobs and
  opportunistically drain a tiny batch. Broad fixed wakeups and routine full-project
  hygiene scans are gone.
- Personal dedup is serialized per personal project in one transaction; cap defaults to
  `RELAY_PERSONAL_MEMORY_ITEM_CAP=500`; About You regeneration is a debounced queued job.
- `RELAY_EMBED_CANONICAL_ENTITIES=false` by default. Entity graph rows remain; canonical
  entity vectors are opt-in. Routine `table=all` backfill covers `memory_items`,
  `observations`, and `source_chunks`.
- `GET /api/projects/:id/memory` clamps limits and returns additive `nextCursor`.
- New scheduler API: `enqueueMemoryPipelineJob`, `drainMemoryPipelineJobs`,
  `markProjectHygieneDue`, `enqueuePersonalStateRegeneration`.
- No deploy, prod Neon change, flag flip, or branch deletion was performed.

Verification run during Phase 3:

- Focused Phase 3 tests: **41/41 passed** (worker, scheduler, personal, DB job repo,
  memory-list route, embedding-backfill route).
- `pnpm --filter @relay/web typecheck`: passed.
- `pnpm --filter @relay/db typecheck`: passed.
- `pnpm --filter @relay/memory-pipeline typecheck`: passed.
- Changed-file ESLint: passed.
- `pnpm test:stable`: **75/75 passed**.
- Full `pnpm --filter @relay/web lint` remains blocked by a pre-existing unrelated
  missing-rule error in `apps/web/src/app/(marketing)/components/hero-section.tsx`
  (`@next/next/no-img-element`).

New safe defaults:

```env
RELAY_PERSONAL_MEMORY_ITEM_CAP=500
RELAY_EMBED_CANONICAL_ENTITIES=false
```

### Phase 4 completed

- Added cached `GET /api/projects/:id/graph?density=compact|full&includeEvidence=true|false`.
- Graph snapshots are bounded and assembled from persisted memory items, canonical
  entities, mentions, entity relations, project sources, source-memory links,
  grouped conversations, memory relations, and optional observations.
- Dashboard graph loading no longer calls the O(n²) `getSimilarityEdgesForProject`
  query or separately fetches archived memory.
- Removed synthetic root/type/Folk hubs, fake fallback `extends` links,
  `REAL_EDGE_MIN`, and the fallback-links setting.
- Sparse projects show real isolated nodes plus explanatory copy. Folk categories
  and memory types are metadata filters, not graph nodes.
- Fullscreen can opt into the evidence layer and filter by node kind, memory type,
  Folk category, and edge kind. Compact/minimap graph keeps evidence off.
- Canonical entity embeddings remain opt-in/off by default; canonical entity rows
  still participate in graph structure.
- No deploy, prod Neon change, flag flip, or branch deletion was performed.

Phase 4 verification:

- Focused graph/API/repository tests: passed.
- Web, DB, and shared typechecks: passed.
- Changed-file ESLint: passed.
- `pnpm test:stable`: **75/75 passed**.
- `pnpm --filter @relay/extension build:prod`: passed.
- `tests/e2e/extension-bg-dispatch.spec.ts`: passed.
- Local dashboard dev server is running at `http://localhost:3000`; browser smoke is
  waiting at local sign-in because the in-app browser has no dashboard auth cookie.
- Full web lint remains blocked by the existing unrelated missing
  `@next/next/no-img-element` rule in `hero-section.tsx`.
- Web production build remains blocked by the existing unrelated client-bundle
  `node:crypto` import through `@relay/shared` / `utils/hashing.ts`.

### CWS shipping strategy (how to ship this huge PR smoothly)

Web (Vercel) and extension (Chrome Web Store) deploy independently:

1. **Merge and deploy web to Vercel** → dashboard users get all improvements immediately
   (graph, personal, Folk taxonomy, governance board, settings matrix). Old extension users
   are unaffected — no breaking API changes.
2. **Submit extension 0.6.0 to CWS simultaneously** → typical review: 1–7 days. During review:
   - Dashboard users: full new experience
   - Extension users (old build): prior behavior intact — background refactor is
     behavior-preserving and ships transparently once approved
   - `RELAY_PERSONAL_MEMORY_AUTOWRITE` stays OFF → no personal routing in prod yet,
     so old extension not knowing Folk categories causes no data issues
3. **After CWS approves** → extension auto-updates for all users. Then flip
   `RELAY_PERSONAL_MEMORY_AUTOWRITE=true` in Vercel.
4. Phase 6 / cutover can begin **in parallel with CWS review** since it's web-only.

CWS approval gates only: `RELAY_PERSONAL_MEMORY_AUTOWRITE` flag flip + any functionality
requiring the new extension (edge save, settings matrix). Everything else ships immediately.

### Before cutover: pricing, limits, and analytics (separate phase, do NOT implement now)

**Pricing:**
- Starter: raise to $8/mo (no current Starter users; safe to change anytime)
- Goal: conversion; current funnel/onboarding issue is the real blocker (tackle later)

**Limits model (needs PostHog evidence first):**
- Unify to two types: **reads** and **writes** (drop granular per-feature limits)
- Monthly primary + daily sub-limits (daily × N = monthly, not 1/30 × monthly)
  - e.g. 300 mo/reads → 20/day reads (users hit limits sooner → upgrade incentive)
- Rolling ticker in extension/dashboard settings (cycle every 10s):
  daily reads → monthly reads → daily writes → monthly writes
- Marketing cards: monthly only (cleaner). Settings + docs: both daily and monthly.
- Internal hard limits (Relay AI messages/day): docs/settings only, NOT pricing page.
- PostHog PAT: `phx_TtFC7MwjjnP7Y4ytQ5kxyGBmqRnV4VFD4m8iE8i2ZyxeALox`
  - Check actual limit-hit rates on paid plans before tightening limits
  - Check Relay AI / MCP tool call frequency (too aggressive on casual chat)

**MCP tool call reduction:**
- Relay AI calls tools too often during casual conversation
- Fix: tighten system prompt gate or add intent classifier before tool dispatch

**Analytics gaps to fill:**
- Separate funnel for agent/MCP surface (distinct from web/extension)
- Extension → dashboard conversion events
- Limit-hit → upgrade conversion events
- Onboarding milestones: first capture, first recall, first project

- **Next: `/review`** the Phase 1–4 branch before adding cutover tooling.
- **Phase 5 — release/cutover tooling.** Prod at migration 0039; do NOT apply 0040–0052
  unchanged. Remove 0049's auto full-prod re-enqueue → explicit bounded operator backfill;
  fix stale verification SQL; reconcile roles vs RLS audit; RLS swap last. Run live gates.
- **Phase 6 — safe rollout plan, then STOP** (no prod cutover). Prefer CWS 0.6.0 first.

Full original 6-phase spec: the session's initial prompt + `docs/memory-v2/HANDOFF.md`
(cutover runbook: env vars, migration runner, RLS swap).

### Review prompt

Review the complete Phase 1–4 memory-v2 branch as production-sensitive code. Prioritize
behavioral regressions, Neon cost regressions, unbounded queries, graph snapshot correctness,
Personal capture/scheduling correctness, migration/cutover risks, missing tests, and extension
background regressions. Run targeted verification where useful. Report findings first with
file/line references. Do not deploy, touch prod Neon, flip flags, or delete branches.

### Phase 5 prompt: release/cutover tooling

Plan and implement Phase 5 tooling without performing prod cutover. Audit migrations 0040+,
replace automatic full-prod re-enqueue/backfill assumptions with explicit bounded operator
commands, fix verification SQL, reconcile worker/app/RLS roles, gate RLS swap last, add
dry-run/progress output and a stop/go rollback runbook, test, commit, and update handoffs.

### Phase 6 prompt: safe rollout plan and stop

Produce the final operator-ready rollout plan coordinating CWS 0.6.0, web deploy, migrations,
bounded backfills, flags, monitoring, rollback, and branch cleanup. Prefer CWS approval before
Personal-dependent behavior; keep Personal autowrite, multi-project capture, and full pipeline
dark initially; include 48-hour Neon cost/autosuspend monitoring. Update docs and commit only;
do not execute production steps.

### Later prompt: pricing, limits, and analytics

After Phase 5/6 planning is complete, separately audit actual PostHog usage and plan pricing,
limits, upgrade conversion, and activation analytics. Do not mix this with the memory-v2
cutover. Evaluate a higher Starter price, a simpler read/write quota model with monthly plus
burst limits, clear settings/extension quota displays, reduced unnecessary MCP tool use, and
separate dashboard/extension/MCP activation funnels. Require evidence from usage distributions
before choosing limits or changing production pricing.

---

## 2026-06-08 — Phase 1 ✅ + Phase 2 ✅ COMPLETE (pushed). Next: Phases 3–6.

**Pushed** to `origin/feat/memory-v2-architecture` (PR #35, HEAD `d339f81`). No prod
touched, no flags flipped, no branches deleted.

### Phase 2 — background/index.ts modularization: DONE (thin entrypoint)
`background/index.ts` **5834 → 8 lines** (init telemetry → `createBackgroundRuntime()`
→ `registerBackgroundListeners(runtime)`). Decomposed into ~25 cohesive modules
(largest non-pre-existing: `association-controller` 684, `capture-controller` 610,
`auth-message-handlers` 520, `message-dispatcher` 493). The sync↔capture cycle was
broken via a dependency-injected `runtime` object (controllers receive their callees
as deps) — not verbatim, but behavior-preserving and verified.

**Verified (this session, the reviewer pass):** ext + web typecheck clean; 160 ext
unit tests; ext prod build clean (no circular deps); **e2e runtime net passes**
(`tests/e2e/extension-bg-dispatch.spec.ts` — drives the real SW: proves the
`onMessage` `void async; return true` port contract + session-cache refresh +
persisted-cache cost behavior at runtime); test:stable 75/75. MV3 checks: listener
registration is synchronous at load (no top-level await), `onMessage`/`onMessageExternal`
keep sync `return true`; cost-cut gating preserved (`onActivated`/`onUpdated` →
`refreshPageStateAndSyncIfMissing`, sync-if-missing not forced).

**Known pre-existing (NOT a regression):** `tests/e2e/extension-inline-chip.spec.ts`
fails — stale UI (last updated commit #13, before this branch's inline-chip rewrite)
+ a racy in-test Plasmo `beforeAll` rebuild. Unrelated to the refactor (background
is proven via the dispatch net). Either update its assertions to the current chip UX
or `test.skip` it with a note — small follow-up, not a blocker.

### Phase 1 — origin/main cost hotfixes merged into the branch ✅
- The branch had forked *before* main's `cf6e278`/`aebf63b`/`bd79e1f` cost cuts and
  never had them. Merged `origin/main` (merge commit `506e29a`); dirty tree preserved
  as WIP `c4628b5` first.
- Hand-resolved `session/route.ts`: now `listCachedProjectsForUser({includePersonal:true})`
  + lightweight `entitlements`, **no per-GET `ensurePersonalProjectForUser`** (provisioning
  stays on the 3 auth routes). Kept `features.multiProjectCapture`.
- Verified all 7 cost protections survive the (mostly silent) auto-merge: unsupported
  tabs → 0 remote (refreshPageStateAndSyncIfMissing gates on shouldSyncMissingRemoteState,

### Phase 1 — origin/main cost hotfixes merged into the branch ✅
- The branch had forked *before* main's `cf6e278`/`aebf63b`/`bd79e1f` cost cuts and
  never had them. Merged `origin/main` (merge commit `506e29a`); dirty tree preserved
  as WIP `c4628b5` first.
- Hand-resolved `session/route.ts`: now `listCachedProjectsForUser({includePersonal:true})`
  + lightweight `entitlements`, **no per-GET `ensurePersonalProjectForUser`** (provisioning
  stays on the 3 auth routes). Kept `features.multiProjectCapture`.
- Verified all 7 cost protections survive the (mostly silent) auto-merge: unsupported
  tabs → 0 remote (refreshPageStateAndSyncIfMissing gates on shouldSyncMissingRemoteState,
  verbatim main); no routine focus/nav/page-state sync; 30-min TTLs (remote-sync-policy.ts
  verbatim main); no billing in bg refresh; forced refresh = lazy mark-stale; bearer
  prefix/token order (viewer.ts verbatim main).
- Cost regression tests 10/10 (remote-sync-policy, session route incl. a real
  no-provisioning spy guard, viewer). test:stable 75/75.
- **Issue fixes:** routing test `does not route personal-profile…` was a STALE test
  (predated `08343d6` visible-Personal routing) — updated to assert auto-save→Personal,
  never to the incidental project. Probed: code routes to Personal (score 100), not a
  privacy bug.
- **Neon `suspend_timeout=0` was a FALSE alarm:** prod compute `ep-broad-glitter-ag5sv14w`
  (branch `br-small-moon-agn70urq` = production, primary+default) already has
  `suspend_timeout_seconds=300`. The `=0` was only the project-level *default template*
  for new endpoints (cosmetic; dashboard-only fix, low priority). Prod already scales to zero.

### Phase 2 — background/index.ts modularization (foundation done, blobs deferred)
index.ts **5834 → 5129 lines** (−705). 8 new modules, each a verbatim move +
typecheck + focused tests + Plasmo build green (no runtime/Playwright pass yet):
`drain-scheduler`, `oauth`, `bg-utils` (+ readErrorResponse), `bg-types`, `state`
(tabStates/dashboardCache/sessionCache holder/authGrace), `context-preview`,
`session-cache` (loadSessionData + dashboard cache + session mutators).

**STOP line (verification-bounded, Playwright deferred).** The remaining middle layer
(tab-lifecycle ↔ broadcast ↔ sync ↔ capture ↔ message-handler) is mutually recursive —
e.g. tab-lifecycle calls **up** into `broadcastActiveProjectState`. The two big blobs
(`captureObservedChange` ~770, `chrome.runtime.onMessage` ~1215) carry runtime-only
risk (MV3 `return true` port semantics, listener-registration timing) that
typecheck+units can't verify. **Do these only with the deferred runtime pass.**

**Idempotency note:** Personal harvest already dedups on `lastRoutedSignature`, which IS
persisted + rehydrated on SW wake — so restart-repeat is largely mitigated. Gap: it's
best-effort tab-signature dedup, not atomic server-side dedup (Phase-3 item).

---

## Round 4 (2026-06-06) — final UI parity + requirements + stale-notes bug

Typecheck (web/ext/db/shared) + `test:stable` 75/0 + eslint green; extension prod+dev
builds clean. Web verified live; extension needs a `chrome-mv3-dev` reload to eyeball.

- **Extension item/section parity** (`control-panel.tsx` + `.module.css`): rewrote
  `SidepanelNoteItem` to the regular item markup (`contextItem` in section cards =
  no inner stripe; `contextItemUnified` + `--stripe` in single tabs) with a source+time
  badge; removed the personal All **header dot** + the double stripe. Stripes now use a
  `--stripe` custom property with a **hover brighten** (color-mix). Notes stripe **grey**
  (#a1a1aa, was amber). Regular **Notes section in All is now expandable + has an add
  composer**, alongside a new **Requirements section** (red).
- **Requirements** are first-class: added to `RelayContextPreview` (contracts +
  `buildDashboardContextPreview`), an All-tab section + a **Requirements tab** in the
  extension, and a **Requirements column** on the web All/requirements tabs
  (`governance-section.tsx` `includeRequirements`, memory-item CRUD). Recolored
  requirement **red #ef4444** (web `TYPE_ACCENT` + `TAB_DOT_COLOR`; graph already red).
- **Web overview** (`dashboard-governance-summary.tsx`): rebuilt to a horizontally
  scrollable 5-column board (decisions/tasks/constraints/notes/requirements), mirroring
  the personal overview board. Verified live (scrollable, 5 cols).
- **🔴 Stale-notes bug fixed**: switching off Personal showed the personal notes in a
  normal project. Two causes: (web) `useMemory` `keepPreviousData` — guarded
  `memory-page-content` on `dashboard.project.id === project.id`; (ext) the optimistic
  project switch (`control-panel.tsx` ~1856/1904) spread `...current` keeping the old
  `contextPreview` — now resets it to empty + `remoteStatus:"loading"` on switch.
- Skeleton parity nudged (personal All loading = 3 placeholder section cards).

### ⏳ Deferred — run on the user's word (NOT done)
Clean personal data for a fresh capture test, via Neon MCP / psql on the dev branch:
- Delete personal-memory rows that leaked into the **Relay** project.
- Fully reset the **personal** project `4156e816-…` (its `memory_items` +
  `project_state`/`project_state_overrides`).
Do NOT run until the user explicitly asks.

---

## Round 3 (2026-06-05) — parity, auto-fanout, derived source, process

Typecheck (web/ext/db/shared) + `test:stable` 75/0 + eslint green; extension prod+dev
builds clean. Web verified live; extension needs a `chrome-mv3-dev` reload to eyeball;
auto-fanout needs a real capture (see test guide).

- **Extension parity** (`control-panel.tsx`): personal `SidepanelNoteItem` now has a
  left category stripe + a **source+time** provenance badge (not a redundant category
  badge); notes preview carries `sourceSurface` (`background/index.ts` + `contracts.ts`).
  Added a minimal `ContextPager` (top+bottom) to personal per-category AND regular
  single-section tabs; color **dots on regular tabs**; sectioned loading skeleton.
- **Web notes column** (`governance-section.tsx` `includeNotes` + `memory-page-content.tsx`):
  regular projects render Notes as a board **column** (stripe/expand/add/source) on the
  All + Notes tabs (replaces the card list + pinned NotesSection). `MemoryColumnBoard`
  gained a bottom pager + `BoardRow.sourceUrl`. Regular tab **dots**.
- **Derived → platform** (`project-context.ts` + both chips): derived governed lines now
  show the project's **predominant capture platform** (verified live: "ChatGPT"/"MCP",
  no bare "Derived"); falls back to "Derived" only when no surface is recoverable.
- **Auto multi-project fan-out** (NEW `project-relevance-service.ts` +
  `capture-service.ts` `autoFanOutByRelevance`): on a normal-origin fresh capture, a
  Gemini classifier picks which OTHER projects the transcript is relevant to and
  link+fans a deferred digest into each (reuses `linkSessionToProjects`/
  `fanOutSessionProjects`). Fire-and-forget, budget-gated, index-based prompt, logs
  every decision (`project_relevance_classified`/`_budget_skipped`/`auto_fanout_failed`).
  Gated by `RELAY_MULTI_PROJECT_CAPTURE`. ⚠️ **Verify the FULL chain on dev** (the extra
  project's session list AND an actually-merged decision/task — links ≠ digests; drain
  must be running, budget not tapped). Whole-session→Personal stays reverted (item-level
  personal fan only).
- **Process docs**: `AGENTS.md` "Feature Dev Lifecycle" (keep dev server + Neon branch
  through user test → cutover for major/medium; Playwright pass before handoff; verify
  full runtime chain) + `CLAUDE.md` pointer.

---

## UI refinement round 2 (2026-06-05) — polish + a real DB bug fixed

All web changes **live-verified** (Playwright on your Chrome, personal `4156e816-…`);
typecheck (web/ext/db/shared) + `test:stable` 75/0 green. Extension changes built
(`pnpm build` clean) — **reload `chrome-mv3-dev` to eyeball**.

**Shared:** `sortPersonalCategoriesByFill(items)` in `packages/shared/.../memory-taxonomy.ts`
— orders Folk categories by count desc, tie-break most-recent. Reused by board,
overview summary, extension tabs/sections.

**Overview:** About-you card is now **read-only with "View all →"** (edit moved to the
memory tab). Restored a **minimal Folk summary** at the bottom — new
`personal-category-summary-board.tsx` (7 cols, horizontal scroll, 3-item preview,
"+N more →" to the memory tab), sorted filled-first. ✅ verified.

**Memory tab:** added an **editable About-you card** (`PersonalStateCard editable`)
above the Folk tabs; board columns now smart-sorted. Save wires `onSaved` →
`queryClient.invalidateQueries(dashboard)` because `router.refresh()` doesn't refetch
the `useMemory` react-query hook. ✅ verified (edit → save → API returns override).

**Graph:** legend now shows an **"Entity"** entry (green `#10b981`) when entity nodes
(e.g. "Minecraft") are present — they were the unexplained green nodes (`makeEntityNode`
→ `type:'note'` → `TYPE_COLORS.note`, no Folk category). ✅ verified.

**Extension** (`control-panel.tsx`): personal **All tab = Folk-category section cards**
(collapsed 1 / expanded 5, sorted, + per-category add) instead of the flat dump;
**per-category tabs = pagination (10/pg) + add composer**. New `addPersonalNote(category)`
posts `note + metadata.personalCategory` (fires regen). Agent **action card → web parity**:
lifecycle pills + Undo (hook `undo()` POSTs `/api/assistant/undo`, card flips to
"undone" locally) + "Can't be undone" note (`extension-chat.tsx`).

### 🔴 Real bug fixed: project-state override INSERT
`PATCH /api/projects/:id/state` 500'd with `null value in column "hidden_decisions"`
whenever the FIRST override row was created via an overview/objective edit (no hidden
arrays supplied) — hit personal **and** a normal project in the logs. Fix:
`project-state-override-repository.ts` upsert now `coalesce($5/$6/$7::jsonb, '[]'::jsonb)`
on insert. This blocked the editable About-you entirely; now saves 200 + override-wins
confirmed via API.

### Watch in your functional pass
- **Reset to auto**: "Reset to auto" PATCHes null overrides. Logic looks correct
  (`"key" in parsed` → replace flag true → null), but my live check was muddied by
  read-model cache timing — confirm it actually reverts to the auto bio.
- Extension All/per-category add + pagination + action-card undo need the chrome reload.
- Round-1 open decision still stands: About-you **override-wins** (edit pins until
  reset) vs merge — now also reachable from the memory tab.

---

## UI-consistency pass (2026-06-04) — personal == regular, different types

Goal from user: the personal project must look/behave like a regular project,
only the memory *categories* differ. All implemented + **live-verified on dev**
(Playwright on your Chrome, personal `4156e816-…`); typecheck ×2 + `test:stable`
75/0 green.

**Memory tab — shared board (Part 1).** New presentational
`apps/web/src/features/memory/memory-column-board.tsx` owns the column chrome
(header + pagination + inline edit/delete + add-footer + expand-on-overflow).
`governance-section.tsx` was refactored to render through it (its project-state
mutations kept intact — regular projects unchanged, verified). `personal-category-board.tsx`
rewritten to use it with plain memory-row CRUD (DELETE/PATCH `/api/memory/:id`,
POST `/api/projects/:id/memory` with `metadata.personalCategory`). All **7 Folk
columns always shown** (even empty) on a horizontally-scrollable row; single-tab
view renders the one column. Verified: 7 cols, pagination, add round-trips with
the right category ("Added." toast).

**Overview — auto-generated editable "About you" (Part 2).** New
`regeneratePersonalState(userId)` in `personal-memory-service.ts` summarizes the
personal items into the existing `project_state` columns (`project_overview` +
`current_objective`) via Gemini — **NO migration** (reuses project columns; DTO's
`buildEffectiveProjectState` surfaces it + applies overrides). New
`personal-state-card.tsx` (replaces deleted `personal-category-summary.tsx`),
editable via the existing `PATCH /api/projects/:id/state` override route + "Reset
to auto". Triggers: tail of `writePersonalFacts` (capture/agent auto-route) and
the manual web add. **Cache invalidation** added after the upsert (else the
cached dashboard read-model showed stale empty state). Verified end-to-end:
add → regen → card populated with a real second-person bio + goals.

**Extension (Part 3).** `background/index.ts` `buildDashboardContextPreview`:
personal panel now shows **all notes** (dropped the `pinned` filter that hid the
auto-routed `pinned=false` facts; raised slice cap). Regular projects keep the
pinned preview. **Needs chrome reload of `chrome-mv3-dev`** (rebuilt this session)
to eyeball.

**Stats + governance + graph (Parts 4/5).** `dashboard-stats.tsx` memory label →
"people · concepts · notes" for personal. Removed the Decisions/Constraints/Tasks
`DashboardGovernanceSummary` from the personal overview and hid the project-state
card on the personal memory page. Graph hub fill opacity `0.92 → 1` so node color
matches the board dots (both already read `PERSONAL_CATEGORY_META`).

### OPEN DECISIONS (your call before cutover)
1. **About-you override semantics.** A manual edit sets an override that *pins*
   the card; auto-regeneration keeps updating the unseen derived field, and
   "Reset to auto" resumes showing it. This is override-wins (same as regular
   project state). You said "edit it but tools also keep it up to date" — if you
   meant *merge* (auto-updates keep flowing after an edit) instead of pin-until-
   reset, that's a different build. Confirm which.
2. **Regen cadence = inline fire-and-forget** on each personal write (budget-gated),
   NOT the dirty-flag + drain the plan named. Defensible (gate caps cost, only
   fires when something was written) but it's pre-cutover Gemini spend — decide if
   you want it moved to a drained cron before flipping autowrite on in prod.
3. **MCP direct `add_memory` to personal** does NOT trigger regen or Folk-categorize
   (it writes a bare note). Capture/agent + web-manual paths are covered. Folk
   categorization of MCP personal writes is deferred (separate work).

### Pre-existing (NOT introduced this pass)
- `[memory-service] post-create hook failed: column "project_id" does not exist`
  in the dev log — relation-service hook, dev-branch schema drift. Unrelated.
- `dashboard-content.test.tsx` fails 3/3 on clean HEAD (Tooltip/TooltipProvider) —
  excluded from `test:stable`; not a regression.

---

## What this branch adds on top of base memory-v2

Three feature lines, layered:

### A. Personal-switch fix (extension)
- `18a528d` Manual project pick wins + sticky on AI chat sites (per-tab
  `manualProjectId` + per-chat-key override map, `pickPreferredProjectId`).
- `9071f07` Personal **stays selected after the first answer** — fresh chats get
  a stable conversation id post-answer; the override now MIGRATES to the new key
  (`isFreshChatKeyUpgrade`) instead of being dropped. Also relaxed the personal
  auto-capture guard so a deliberately-selected Personal captures into Personal.

### B. Multi-project capture (shared session) — gated `RELAY_MULTI_PROJECT_CAPTURE`
- `c43fb8d` server core: `session_projects` link table (**migration 0051**),
  read-union, `linkSessionToProjects`, membership checks. Shared SESSION only —
  `memory_items` stay single-project.
- `b47d750` write surfaces: "also save to" chevron (extension) + MCP `"personal"`
  alias.
- `40de32c` duplicate-capture path links + harvests; cutover docs.
- `671c445` MCP `"personal"` alias fetches `?includePersonal=true` (was throwing).

### C. Personal memory = Folk taxonomy (person/company/concept/event/meeting/signals/note)
- `d2b1e56` **Personal-origin captures harvest facts, not project digests** — the
  core invariant fix. `buildPersonalRoutingText` reads the whole transcript
  (facts live in the assistant turn). Origin digest runs INLINE; budget limit →
  "limit hit", no queue.
- `880c868` Folk categories + saving toast on every capture path.
- `982c7fd` Folk categories rendered across surfaces (shared `PERSONAL_CATEGORY_META`).
- `99e03e0`/`7f6fea3`/`9db8683`/`8bfc618` Folk category UI: personal memory tab =
  category **board** (column-per-category, project-dashboard style); overview =
  category breakdown; graph = category hubs + legend; extension panel = category
  tabs + filtered notes. **Personal project ONLY** — normal projects unchanged
  (verified live).
- `77643a8` then `9a096a4`: auto-route-whole-session-to-Personal was tried then
  REVERTED. The item-level harvest (`routePersonalMemory`) already runs on every
  non-personal capture and fans personal facts into Personal as categorized
  notes — so a mixed chat keeps its session in the right project while its
  personal bits still land in Personal. Whole-session routing was the wrong layer.

**Storage model (unchanged, important):** shared SESSION, not shared memory
items. Personal items store as `type:'note'` with the real category in
`metadata.personalCategory`. No DB type-enum change.

---

## Verified vs NOT verified

- **Verified (this session, mostly LIVE on dev via Playwright on your Chrome):**
  - Personal memory tab → Folk category board (All: Concept 11 · Signals 1 · Note 3).
  - Personal overview → category breakdown; normal project → project-state card.
  - Personal graph → category hubs + legend (Concept/Signals/Note); normal project
    graph unchanged (165 nodes, Decisions/Tasks/Constraints legend).
  - Personal extension panel → category tabs + filtered notes (in fresh build).
  - typecheck ×5 clean; extension 132/0; `test:stable` 75/0.
- **NOT verified — DO THESE FIRST next session:**
  1. **Personal STAYS selected through the first answer on a FRESH chat** — the
     `isFreshChatKeyUpgrade` fix. Pick Personal on a brand-new Perplexity chat,
     ask, confirm it doesn't revert to Relay, and the chat captures into Personal.
  2. **Auto-capture into a deliberately-selected Personal** actually saves.
  3. **Multi-project "also save to" chevron** end-to-end (flag is ON on dev):
     save one chat to A + B + Personal, confirm each project's session list +
     own facts; Personal gets category notes only.
  4. **MCP `"personal"` alias** via the Relay MCP: `save add_memory projectId:"personal"`.

---

## Known rough edges (for your review pass — not blockers)

- **Dashboard stats bar** on the personal overview still shows project-shaped
  labels ("decisions · tasks · constraints") in the small stat widget
  (`dashboard-stats.tsx`) — separate from the (fixed) memory card. Cosmetic.
- **Aggressive personal harvest**: `routePersonalMemory` runs on every capture
  with autowrite ON — tune the salience threshold if Personal collects noise.
  Sample the `memory.personal_fact_skipped` logs.
- **Project memory-type rename** (decision→fact etc.) is the still-DEFERRED Folk
  enum work (DB enum + card + MCP + digest); doesn't block cutover.

---

## START next session

1. Run the 4 NOT-verified live checks above (dev stack is up — see below).
2. `/code-review ultra` (or `/review 35`). Apply fixes; re-run
   `pnpm --filter @relay/web typecheck` + `pnpm test:stable` after each.
3. If satisfied → cutover.

## CUTOVER (full runbook: `docs/memory-v2/HANDOFF.md` §"Production cutover")

1. Snapshot prod (Neon PITR 6h) → apply migrations **0040–0051** (additive).
   `0051` = `session_projects` + backfill + RLS. Verify
   `count(session_projects) == count(source_sessions)`.
2. `CRON_SECRET` in Vercel (cron + backfill fail closed without it).
3. Deploy merged branch.
4. Embedding-backfill loop until remaining=0.
5. `RELAY_MEMORY_PIPELINE_FULL=true` + `RELAY_HYGIENE_DRY_RUN=true` one week;
   soak `RELAY_PERSONAL_MEMORY_AUTOWRITE` (log-only) before flipping personal
   auto-write on. **NOTE:** dev has autowrite ON already for testing.
6. **Flip `RELAY_MULTI_PROJECT_CAPTURE=true`** only after 0051 backfill verified.
   N× Gemini digest cost per capture (per-project budget still enforced).
7. 🔒 **F3 RLS swap** incl. the new `session_projects` policy ("Members manage
   session_projects"). Until then prod RLS is decorative; the app-level
   `members.filterMemberProjectIds`/`isMember` checks are the real enforcement.
8. Chrome resubmission — content-script + control-panel DOM changes need a
   listing-disclosure update.

CAVEAT: confirm migration numbers `0040–0051` are actually unapplied on prod
before running.

---

## Running now (dev stack — keep alive for your testing)

- **Web dev** `localhost:3000` (HTTP 200, pid 76936). Log `/tmp/relay-web-dev.log`.
  Env `apps/web/.env.local`: `AUTH_PROVIDER=local`, dev branch
  `br-muddy-morning-ag55csrg` (`ep-raspy-rice-aga5ng27`),
  `RELAY_PERSONAL_MEMORY_AUTOWRITE=true`, `RELAY_MULTI_PROJECT_CAPTURE=true`,
  holds the prod `RELAY_CONTENT_ENCRYPTION_KEY` (gitignored).
- **Plasmo dev watcher** (pid 76965). Log `/tmp/relay-plasmo-dev.log`. Build
  `apps/extension/build/chrome-mv3-dev` (points localhost:3000 + local auth) —
  **load THIS one in Chrome, NOT chrome-mv3-prod** (prod build talks to
  production). Reload it in `chrome://extensions` to pick up the latest build.
- **Sign in to the dashboard via the local form** ("Or continue locally") on
  `/sign-in` — NOT the Google button (localhost has no Google redirect → 400).
  Your account `alimkhan.ergebayev@gmail.com`; personal project
  `4156e816-3a9d-4d86-85e7-1793fd864359`.

### To restart the stack if it's down next session
```
# web (from repo root)
pnpm --filter @relay/web dev > /tmp/relay-web-dev.log 2>&1 &
# extension watcher
cd apps/extension && pnpm dev > /tmp/relay-plasmo-dev.log 2>&1 &
```

## TEARDOWN owed (after cutover, NOT before)
- `rm apps/web/.env.local` (holds prod content key + the dev flags).
- Stop web dev + plasmo watcher.
- Do NOT delete dev branch `br-muddy-morning-ag55csrg` until prod cutover verified.
