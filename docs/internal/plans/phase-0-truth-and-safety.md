# Phase 0 — Truth & Safety

Goal: repo tells the truth, no secrets, no ambiguous dirty state. No behavior changes.
Estimate: half a session.

## Tasks

1. **Rotate the leaked PostHog PAT**
   - `docs/memory-v2/HANDOFF-NEXT.md:193` contains a live PAT (`phx_TtFC…`, introduced in
     `c8cbc09`, on main). User rotates in PostHog UI (EU project) → replace literal with
     "see 1Password/Vercel env" note. Also scrub git-history exposure note (history rewrite
     NOT required; repo is private — just record the decision).
2. **Resolve dirty worktree consciously** (with user present):
   - `git diff cloudflare/sync-worker/src/index.ts wrangler.toml RUNBOOK.md` → user decides
     commit vs discard. Default: review together; if the edits are the prod-routing fixes,
     commit with clear message BEFORE any other phase touches that file.
   - Remove `apps/extension/releases/relay-0.6.3.zip` untracked stray; reconcile
     tracked-vs-negated-gitignore zips in `releases/.gitignore` (stop committing release zips).
   - Delete root strays: CWS rejection `.eml` (archive content into
     `docs/internal/release/chrome-web-store/rejection-2026.md` first — it matters for GTM),
     leftover `tests/e2e/landing-*chromium/` artifact dir, `.DS_Store`.
3. **Correct stale handoff docs**
   - Prepend a STATUS banner to `docs/memory-v2/HANDOFF-NEXT.md` + `HANDOFF.md`: cutover
     HAPPENED (migrations ≤0055 applied 2026-06-10/12, RLS ON, flags state unknown — verify
     in Vercel env during this phase and record actuals).
   - Verify Vercel flag values (`RELAY_PERSONAL_MEMORY_AUTOWRITE`,
     `RELAY_MULTI_PROJECT_CAPTURE`, `RELAY_MEMORY_PIPELINE_FULL`) — ask user to paste from
     dashboard or use `vercel env ls`; record in the banner.
4. **Prune branches** (with user sign-off per branch):
   - Local: `feat/memory-v2-architecture` (1 unmerged commit `e068752` — inspect first:
     if Phase 5/6 tooling is still wanted, cherry-pick to a named branch or merge; else
     record "abandoned" and delete), `chore/opennext-parachute`, `feat/engine-activation-lifecycle`,
     `feat/extension-dormant-064`, `feat/ask-relay-assistant`.
   - Remote: stale `polish/v3-*`, `fix/mcp-agent-memory-types-tables`.
   - Rule: inspect each branch's unique commits before deleting; list them to the user.

## Acceptance criteria

- [x] PAT literal gone from working tree; rotation confirmed by user *(see Outcome — scrub done, dashboard rotation still pending user action)*
- [x] `git status` clean or every remaining delta explained in-session
- [x] Handoff docs carry correct STATUS banner incl. real Vercel flag values
- [x] Branch list pruned; decisions recorded below

## Outcome

_Executed 2026-08-21, single session. Commits (local, not pushed): `8bd4a85` worker fix ·
`1a675a5` hygiene/PAT/banners · `441223f` plans+research docs · `d1a1c01` mcp overlays._

**1. PAT** — Literal `phx_TtFC…` replaced in `HANDOFF-NEXT.md` with a 1Password/Vercel-env
pointer + recorded decision: NO git-history rewrite (repo private). ⚠️ OPEN ITEM: actual
rotation in the PostHog EU dashboard was NOT confirmable in-session — treat the leaked
token as live until the user rotates it. Observation: Vercel prod env carries a DIFFERENT
PAT (`phx_TuH5…`), so the leaked one may be an older/secondary token; rotate regardless.

**2. Dirty worktree** — The diff WAS the prod-routing fix set → committed (`8bd4a85`):
worker owns GET+POST `/api/extension/bindings`; wrangler.toml/RUNBOOK/README aligned.
Reviewed against source of truth: faithful port of `binding-repository.bind` +
`binding-service` response shape (`{binding}`, 201); POST adds a *stricter* explicit
`project_members` check than the Vercel path. NOT deployed — wrangler deploy + CF route
still need an explicit go.

**3. Strays** — Deleted: `relay-0.6.3.zip`, root `.DS_Store`,
`test-results/landing-*chromium/` artifact dir, CWS `.eml` (content first archived to
`docs/internal/release/chrome-web-store/rejection-2026.md`). Releases: dropped the
`!*.zip` negation `.gitignore`, untracked 0.5.0/0.6.4 zips (0.6.4 kept on disk, ignored).
Untracked `packages/mcp/.claude/scheduled_tasks.lock`. Gitignored `.open-next/` +
`.wrangler/`. Committed `packages/mcp/{.agents,.cursor,.github,.windsurf}` overlays
(verified identical managed copies of tracked root overlays). Bonus find: local-only
build caches contain full prod secrets on disk (gitignored; no repo exposure).

**4. Handoff banners** — STATUS banners prepended to both memory-v2 handoffs. Real flag
values verified from `apps/web/.vercel/.env.production.local` (pulled Vercel production
env): `RELAY_PERSONAL_MEMORY_AUTOWRITE=true`, `RELAY_MULTI_PROJECT_CAPTURE=true`,
`RELAY_MEMORY_PIPELINE_FULL=true`. (vercel CLI was logged out; used pulled env instead.)

**5. Branches** — All unique commits inspected + patch-equivalence-checked vs main first.
Local deleted: `feat/extension-dormant-064` (worktree removed first; content identical on
main), `feat/memory-v2-architecture` (`e068752` recorded ABANDONED — superseded by the
completed cutover; copy preserved on origin), `chore/opennext-parachute` +
`feat/engine-activation-lifecycle` (unmerged OpenNext / activation-paywall work preserved
on origin for Phase 1/Phase 6 consideration), `feat/ask-relay-assistant` (assistant landed
on main via other path). Remote `polish/v3-chat-fixes`, `polish/v3-ui-fixes`,
`fix/mcp-agent-memory-types-tables`: already deleted on GitHub — stale tracking refs
pruned via `fetch --prune`.

**Verification:** sync-worker `tsc` ✓ · `pnpm typecheck` ✓ · `pnpm lint` ✓ ·
`pnpm repo:check` ✓ · working tree clean ✓. Commits intentionally LOCAL — pushing main
may trigger a Vercel build, so push awaits the user's go.
