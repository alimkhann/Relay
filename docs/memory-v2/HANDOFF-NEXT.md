# Next-session handoff — review → cutover

Branch `feat/memory-v2-architecture` (PR #35). This session added the
**personal-switch fix** + **multi-project capture (shared session)** on top of
the already-complete memory-v2 work. Next session = Claude review → fixes →
**production cutover**.

## What shipped (8 commits, 18a528d → 880c868, ALL PUSHED)

Commits 6–8 (personal-memory quality, after live testing exposed defects):

6. **`d2b1e56` fix: personal-origin captures harvest facts, not project digests** —
   capturing a chat while parked on Personal ran a full project digest into
   Personal (decisions/constraints/tasks), violating the facts-only invariant.
   Now origin=personal skips the project digest and runs the new
   `routePersonalFromTranscript` (salience notes only; bypasses the
   `active===personal` early-return that made the naive fix a no-op).
   `buildPersonalRoutingText` now reads the WHOLE transcript with role labels
   (facts often in the ASSISTANT turn — "what do you know about me" recap).
   **No queues for the user:** origin digest runs INLINE always (dropped
   fast_ack deferral); on budget limit → "limit hit", no deferred job; extra
   fan-out projects still async. Classifier cap 5→30, output 600→2400.
7. **`880c868` feat: Folk categories + saving toast on every path** — personal
   categories now match Folk (person, company, concept, event, meeting,
   signals, note); metadata-only, no DB/UI/MCP change. Saving toast now shows on
   manual + auto + held→continue (was gated on autoAssociated||explicit).

**Still open from #6–7 (for review/next pass):**
- Surfacing `personalCategory` in the dashboard card UI (Folk-style colored
  dots/legend) — data is tagged, not yet rendered.
- PROJECT memory-type rename (decision→fact etc.) — still deferred Folk enum
  work (DB + card + MCP + digest), doesn't block cutover.

## What shipped earlier this session (5 commits, 18a528d → 671c445)

1. **`18a528d` fix(extension): manual project switch wins + sticky** — picking
   Personal (or any project) on an AI chat no longer reverts to the chat's
   auto-association. Per-tab `manualProjectId` + per-chat-key persisted override
   map (`relay.routing.manualOverrides`), pure `pickPreferredProjectId`
   precedence helper, honored in sync resolution / picker render / capture
   routing, cleared on chat-nav + association retarget. (NOTE: also carried some
   pre-existing routing WIP in those files.)
2. **`c43fb8d` feat: multi-project capture server core** — `session_projects`
   link table (migration **0051**), `SessionRepository` read-union + link
   methods, `MemberRepository.isMember/filterMemberProjectIds`, `saveCapture`
   fan-out + `linkSessionToProjects`, `POST /api/captures/[sessionId]/links`.
   Shared SESSION only — `memory_items` stay single-project; recall/brief/
   dashboard/quota read paths untouched.
3. **`b47d750` feat: write surfaces (extension + MCP)** — "also save to" chevron
   dropdown on Link & save (Personal pinned, right-aligned checkboxes),
   `additionalProjectIds` threaded contract→bg→captureTab→`/api/captures`,
   `features.multiProjectCapture` in the session payload gates the chevron, MCP
   `"personal"` projectId alias. Personal auto-capture guard hardened to check
   the override-resolved target.
4. **`40de32c` fix: dup-capture path + cutover docs + tests** — re-saving an
   already-captured chat with new targets now links + fans out (was dropped);
   session-route feature-gate test; HANDOFF.md cutover steps for 0051 + flag.
5. **`671c445` fix(mcp): personal alias `?includePersonal=true`** — the alias
   threw because bare `/api/projects` omits personal; own fetch in
   `tools/resolve-personal.ts`, regression-tested.

**Storage model:** shared SESSION, NOT shared memory items. One chat links to N
projects; each project runs its own digest over the same transcript. Personal as
a target = LINK + `routePersonalMemory` harvest, NEVER a project digest
(preserves the no-full-chat-into-Personal invariant).

**Gating:** all behavior behind `RELAY_MULTI_PROJECT_CAPTURE` (off in prod).
Migration 0051 + backfill ship safe unflagged.

## Verified vs NOT verified

- **Verified:** typecheck ×5 (shared/db/web/extension/mcp); `test:stable` 75/0;
  new unit tests (manual-overrides, routing precedence, session-repo,
  capture-service fan-out/personal/idempotency/membership, session feature gate,
  mcp personal alias); migration 0051 applied + backfilled on dev branch
  `br-muddy-morning-ag55csrg` (226 sessions → 226 links, union==origin, RLS on).
- **Partly verified LIVE this session:** auto-capture into a real project worked;
  capturing while parked on Personal worked but exposed the digest-into-personal
  bug (now fixed in `d2b1e56`). Personal project for alimkhan.ergebayev@gmail.com
  (`4156e816`) was WIPED CLEAN (0 items/sessions/digests/state) for a fresh
  re-test of the new salience path.
- **NOT verified (do early next session):**
  1. **Live re-capture into the clean Personal** — confirm the salience path now
     fills Personal with many user-bio NOTES (Folk categories), not 4 digest
     items, and that facts are correct (assistant-turn recitals can be wrong).
  2. **Live browser pass of the personal-switch fix** on claude.ai (Playwright
     MCP can't load extension+auth — must be a real browser).
  3. **Live flag-ON multi-project capture** to A+B+Personal per-project facts.
  4. **Eyeball:** saving toast now on all paths; in-page toast shimmer smooth.
- **Pre-existing full-suite failures** (dashboard/sidebar/page/dashboard-content
  + mcp client/project-detection) are harness setup (QueryClient / TooltipProvider
  / DATABASE_URL) and do NOT reference the changed modules. `test:stable` is the
  green subset. If challenged: `git checkout d7cc3c1 && pnpm test`, diff the
  failing set.

## Deferred (not built)

**Auto-capture fan-out** to multiple high-confidence candidates.
`evaluateProjectRouting` returns ONE candidate by score-gap design; fanning to
runners-up cross-posts into not-confident projects + N× auto Gemini spend. Needs
its own routing-semantics design + soak (like the personal-autowrite soak).

## Open seam for review (don't fix pre-cutover)

"Save to Personal" is inconsistent: Personal as the **primary** target (manual
save while parked on Personal) runs a full project digest into Personal
(pre-existing path); Personal as an **additional** target = link + harvest only.
Part-1 makes landing on Personal easier, increasing exposure. Flag in review.

## START next session

1. Branch is PUSHED (HEAD `880c868`). Run `/code-review ultra` (or `/review 35`).
   Apply fixes; re-run `pnpm --filter @relay/web typecheck` + `pnpm test:stable`
   after each.
2. Resolve the NOT-verified items above (esp. live re-capture into clean
   Personal) before trusting the feature in prod.

## CUTOVER (docs/memory-v2/HANDOFF.md §"Production cutover", now updated)

1. Snapshot prod (Neon PITR 6h) → apply migrations **0040–0051** (additive). 0051
   = `session_projects` + backfill + RLS. Verify: `count(session_projects)` ==
   `count(source_sessions)`.
2. Set `CRON_SECRET` in Vercel (cron + backfill routes fail closed without it).
3. Deploy merged branch.
4. Embedding-backfill loop until all 3 tables remaining=0 (HANDOFF §5).
5. `RELAY_MEMORY_PIPELINE_FULL=true` + `RELAY_HYGIENE_DRY_RUN=true` one week;
   soak `RELAY_PERSONAL_MEMORY_AUTOWRITE` (log-only) before flipping personal
   auto-write on.
6. **Flip `RELAY_MULTI_PROJECT_CAPTURE=true`** only after 0051 backfill verified.
   Watch N× digest spend (each extra linked project = its own Gemini extraction;
   per-project budget still enforced by `decideDigestStrategy`).
7. 🔒 **RLS swap (F3)** — provision least-priv `relay_app` role
   (docs/memory-v2/roles.sql), move app DATABASE_URL off the bypassrls owner.
   **Include the new `session_projects` policy** ("Members manage
   session_projects", keyed on `is_project_member(project_id)`). Until this lands,
   prod RLS is decorative and the multi-project write surfaces rely on the
   app-level `members.filterMemberProjectIds`/`isMember` checks.
8. Chrome resubmission — content-script + control-panel DOM changes need a
   listing-disclosure update.

## Running now (for testing)

- Web dev `localhost:3000`, pid in `ps`, log `/tmp/relay-web-dev.log`. Env
  `apps/web/.env.local` → dev branch `br-muddy-morning`, `AUTH_PROVIDER=local`,
  `RELAY_PERSONAL_MEMORY_AUTOWRITE=true`, **`RELAY_MULTI_PROJECT_CAPTURE=true`**
  (added this session), holds the prod `RELAY_CONTENT_ENCRYPTION_KEY` (gitignored).
- Plasmo dev watcher, log `/tmp/relay-plasmo-dev.log`, build
  `apps/extension/build/chrome-mv3-dev` (rebuilt 12:39, points localhost:3000 +
  local auth).

## TEARDOWN owed

- `rm apps/web/.env.local` (prod content key + autowrite + multi-project flag).
- Stop web dev + plasmo watcher.
- Do NOT delete dev branch `br-muddy-morning-ag55csrg` until prod cutover verified.
