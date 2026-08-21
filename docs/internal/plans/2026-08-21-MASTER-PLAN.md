# Relay Recovery — Master Plan (2026-08-21)

Status: APPROVED. Execution happens one phase per fresh session. Each phase has its own
doc in this folder; a session should read MASTER-PLAN + its phase doc only.

## Ground truth established 2026-08-21 (supersedes older handoff docs)

- Prod Neon (`shiny-term-32281581`, branch `br-small-moon-agn70urq`, db `neondb`) is on
  **migrations through 0055** (applied 2026-06-10/12). RLS enabled on all key tables.
  Memory-v2 IS live: 203 personal projects, 999 `session_projects` links, pipeline jobs active.
  The "prod at 0039 / cutover pending" claims in `docs/memory-v2/HANDOFF*.md` are STALE.
- Cost driver is COMPUTE, not storage (~150MB total): ~212 active compute-hours/month,
  caused by hot-path seq scans (`project_members` 111.8M, `project_bindings` 4M) and
  extension polling that keeps the compute awake via the Cloudflare worker.
- Budget constraint: keep Neon cheap/free tier; max $5/mo Cloudflare; Vercel free tier.
  Do NOT migrate Postgres elsewhere; make the compute sleep instead.
- Last commit 2026-07-01; dirty worktree incl. `cloudflare/sync-worker/src/index.ts`.
- Leaked secret: PostHog PAT in tracked `docs/memory-v2/HANDOFF-NEXT.md:193` — rotate first.

## Hard guardrails (apply to every phase)

1. NEVER drop tables/columns/rows. Index drops only after usage verification AND a
   Neon snapshot/PITR checkpoint, and only with explicit user sign-off in-session.
2. No prod flag flips, no deploys without the user's explicit go in that session.
3. Every phase ends green: typecheck, lint, targeted tests; full suite green from Phase 3 on.
4. Zero-downtime migrations only (Neon MCP prepare flow); additive-first.
5. Tests must assert expected behavior contracts — never written to bless current output.
6. Keep changes small and reviewable; no drive-by refactors outside the phase scope.

## Phases (execute strictly in order)

| Phase | Doc | Theme |
|---|---|---|
| 0 | `phase-0-truth-and-safety.md` | Rotate PAT, resolve dirty worker state, fix stale docs, prune branches/files |
| 1 | `phase-1-neon-cost-and-performance.md` | Make Neon fast and nearly-free; de-bloat CF worker + Vercel serverless paths |
| 2 | `phase-2-bug-fixes.md` | xcross chip resurrection, personal-routing verification + fixes, auth instrumentation |
| 3 | `phase-3-tests-green-and-honest.md` | Kill stale tests, add contract tests for critical services, CI blocking again |
| 4 | `phase-4-slop-and-architecture.md` | Monster-file decomposition, dead code removal, dedup, barrel split |
| 5 | `phase-5-ui-polish.md` | Design-review pass over landing/dashboard/sidepanel; kill UI slop |
| 6 | `phase-6-easy-product-wins.md` | Conversion part 1 only: milestone events, social proof, checkout CTAs |

Deferred (explicitly out of scope until user reopens): product repositioning (agent-memory
pivot), scratchpad feature, team memory, pricing changes.

## Session logistics

- One fresh session per phase, build mode, starting from this folder's phase doc.
- If a session must deviate from its doc materially, it stops and reports back instead
  of improvising.
- After each phase: update the phase doc's "Outcome" section with what actually happened.
