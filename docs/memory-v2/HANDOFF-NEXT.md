# Next-session handoff — review → fixes → cutover

Branch `feat/memory-v2-architecture` (PR #35), **all pushed** (HEAD `8bfc618`).
Next session = your last checks → Claude review → fixes → **production cutover**
if you're satisfied.

This file supersedes the older state. Read `docs/memory-v2/HANDOFF.md` for the
full cutover runbook (env vars, migration runner, RLS swap).

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
