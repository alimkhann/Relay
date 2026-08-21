# Summer Audit — Repo, Architecture & Hygiene (2026-08-21)

Read-only audit. Last commit: `ebfa6d2` (2026-07-01) — ~7 weeks stale, dirty worktree on top.

## TL;DR

Layering discipline is genuinely good (zero upward package imports, thin typed route
handlers over services, centralized `withApiAuth`, zero TODO/FIXME debt). The rot is
concentrated in a handful of monster files, one split-brain backend fork, and a frozen
cutover — not systemic.

## CRITICAL

### 1. `control-panel.tsx` — 5,121 lines
`apps/extension/src/components/control-panel.tsx:334-4570` is a single React component
(~4,200 lines) with 33 `useState` + 17 `useEffect`, handling auth/OTP, billing,
active-project state, capture settings, assistant results, context preview mutations and
usage metering. Imports are interleaved mid-file after component code (line 118+).
Hardcoded `EXTENSION_DISPLAY_VERSION = "0.5.0"` at :140 while package.json is 0.6.4 —
user-visible lie risk.
**Direction:** decompose along existing seams (`control-panel-state.ts` already exists):
one hook per concern (`useBillingStatus`, `useActiveProjectState`, `useCaptureSettings`,
`useUsageMetrics`) + presentational sections. No component >300 lines.

### 2. Split-brain production backend: Cloudflare sync worker
`cloudflare/sync-worker/src/index.ts:73-95,162-251,253-330` hand-forks extension-token
auth, binding validation, and resolve SQL outside the typechecked workspace ("a faithful,
self-contained port of the Vercel handler's behaviour" per its own header). Zero tests.
Serves prod traffic for the extension's hottest endpoint (`/api/extension/bindings`).
**Currently carries uncommitted local modifications** alongside `wrangler.toml` +
`RUNBOOK.md`.
**Direction:** either make the bindings endpoint cheap enough on Vercel (edge-cached read
model / Neon pooled endpoint) and delete the worker, or extract framework-free shared
validation+SQL compiled for both targets with a contract test replaying identical fixtures
against both implementations. First step regardless: commit or discard the dirty worker
edits consciously.

## HIGH

3. **Hosted MCP god-route** — `apps/web/src/app/api/mcp/stream/route.ts:375-1084`:
   1,203-line route file; `registerHttpTools` is one ~709-line function. `packages/mcp/src/tools/*`
   already models this correctly (one file per tool + registry). Extract `server/mcp-hosted/`,
   share tool semantics between local and hosted MCP instead of two registries.
4. **`bootstrap-service.ts` god module (1,507 ln)** — five markdown renderers (:668-938),
   Gemini prompt gen (:958-1060), hashing, scheduling policy, and a ~365-line orchestrator
   (:1119-1483). Split into `bootstrap/{shape,render/*,generate,scheduler-policy}`; renderers
   are pure functions begging for snapshot tests.
5. **Assistant chat client forked twice** — `use-assistant-chat.ts` (931 ln web) vs
   `use-extension-chat.ts` (821 ln ext): identical attachment DTO mappers, identical
   `MAX_ATTACHMENTS_PER_MESSAGE = 8`, divergent types for the same wire DTO. Guaranteed
   drift. Extract headless `useAssistantChatCore` parameterized by transport/storage.
6. **CLI/Wizard auth duplication** — `api/cli/auth/{start,poll}` vs `api/wizard/auth/{start,poll}`
   near-copy routes writing to the same `cliAuthSessions` repo. Consolidate to one parametrized handler.
7. **Test coverage inverted vs risk** — 37 of ~57 web services have no unit test, including
   `google-auth-service`, `local-auth-service`, `auth-sync-service`, `rate-limit-service`,
   `billing-service` neighbors. Meanwhile CI marks full-suite and e2e jobs
   `continue-on-error: true` (`.github/workflows/ci.yml:51,79`) — only lint/typecheck/stable/build block.
8. **Frozen cutover + stale branches** — see bug-findings doc. Five unmerged local branches
   2–3 months old (`feat/memory-v2-architecture` still 1 commit ahead of main with Phase 5/6
   cutover tooling that never landed), plus stale remotes.

## MEDIUM

9. Unused root devDeps: browserify polyfill stack (`buffer`, `crypto-browserify`,
   `stream-browserify`, `vm-browserify`, `events`, `process`, `string_decoder`) — abandoned
   bundler config. Root `package.json:54-68`. Plus 4 orphaned ops scripts in `scripts/`.
10. ~27 dead exported symbols / 4 dead modules in `@relay/shared` (`utils/decay.ts`,
    `memory-decay.ts`, `temporal-normalization.ts`, `query-analysis.ts`) — shipped into every
    consumer bundle including published npm packages.
11. Competitor research tracked at sloppy filenames (`docs/internal/research/nia.md`,
    `Full Spec_ Nia by Nozomio Labs.md`, `PERPLEXITY.md`, referral-system question dump)
    while packages declare a public GitHub `repository` URL. Move to private storage or scrub.
12. Benchmark result blobs (April 2026 JSONLs) committed under `benchmarks/longmemeval/results/`;
    benchmarks untouched since April.
13. Error-message inconsistency (`"Unauthorized."` / `"Unauthorized"` / `"unauthorized"`)
    + 65 stray `console.*` calls bypassing the structured logger across 20 web files.
14. Leftover Playwright artifact dir inside `tests/e2e/`; `trace: on-first-retry` is dead
    config given `retries: 0` (`playwright.config.ts:6-9`). E2E suite is 4 specs, chromium-only,
    against `next dev` — thin relative to AGENTS.md's Playwright-before-handoff policy.
15. `packages/mcp` imports `@relay/shared` ×7 with it only as a devDep — works solely because
    tsup bundles devDeps. Fragile contract; make it an explicit `noExternal` entry or real dep.
16. Shared barrel mixes Node-only and browser-safe code (the `node:crypto` drag forcing deep-path
    imports in both apps — same workaround comment duplicated at
    `apps/web/src/components/assistant/use-assistant-chat.ts:3-4` and
    `apps/extension/src/components/use-extension-chat.ts:2-3`). Also blocks web prod build
    per HANDOFF-NEXT.md. Add a browser-safe subpath export.

## LOW

17. Stray CWS rejection `.eml` in repo root (untracked, gitignored) — delete locally or file
    under `docs/internal/release/chrome-web-store/`; its content matters strategically (see strategy doc).
18. `apps/extension/ext-key.pem` on disk (ignored) — confirm disposable vs the CRX signing key.
19. `.mcp.json` committed (portable shadcn server — borderline OK per AGENTS.md).
20. Repeated quota preamble copy-pasted across ~8 sources routes (could be a wrapper).
21. `benchmarks/` scripts wired in root package.json but effectively dormant.

## SECURITY

- **PostHog PAT committed**: `phx_TtFC…` lives in tracked `docs/memory-v2/HANDOFF-NEXT.md:193`
  (introduced in `c8cbc09`, present on `main`). Rotate the token and strip the literal.
- Prod-secret env files sit loose in repo root (`.env.production`, `.env.vercel*`) — correctly
  gitignored but one `git add -f` away from disaster. Consider a secrets manager or at minimum
  a pre-commit guard.

## What's genuinely good

- Zero TODO/FIXME/HACK debt; tribal knowledge lives in handoff docs (which themselves go stale).
- Clean layering: no upward imports anywhere; 94 route files on the shared auth wrapper.
- Cost discipline is real (gated flags, bounded queries, suspend-to-zero verified on prod compute).
- Publish pipeline (tsup + dry-runs) sound; `repo:check` hygiene enforced in CI.
