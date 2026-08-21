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

- [ ] PAT literal gone from working tree; rotation confirmed by user
- [ ] `git status` clean or every remaining delta explained in-session
- [ ] Handoff docs carry correct STATUS banner incl. real Vercel flag values
- [ ] Branch list pruned; decisions recorded below

## Outcome

_(fill after execution)_
