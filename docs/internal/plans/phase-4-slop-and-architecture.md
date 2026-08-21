# Phase 4 — Slop & Architecture Cleanup

Goal: remove dead weight, split the monsters, deduplicate forked logic. Behavior-
preserving; each item lands as its own small PR-sized commit with tests from Phase 3
as the safety net.

## Tasks (ordered by value/risk)

### A. Shared barrel split — unblocks web prod build (do FIRST)
- `@relay/shared` barrel drags `node:crypto` into client bundles (known prod-build
  blocker per HANDOFF-NEXT; workaround comments duplicated in both apps).
- Add browser-safe subpath export (e.g. `@relay/shared/browser` or per-module exports);
  move hashing/crypto into a node-only entry. Remove both deep-import workarounds.
- Acceptance: `pnpm --filter @relay/web build` succeeds.

### B. Dead code removal
- Delete ~27 unused exported symbols + 4 dead modules in `@relay/shared`
  (`utils/decay.ts`, `memory-decay.ts`, `temporal-normalization.ts`,
  `query-analysis.ts`) — verify each with whole-repo search first.
- Remove unused root devDeps: `buffer`, `crypto-browserify`, `stream-browserify`,
  `string_decoder`, `vm-browserify`, `events`, `process` (root package.json:54-68).
- Delete orphaned scripts: `configure-posthog-observability.mjs`,
  `open-posthog-playwright.mjs`, `rebuild-posthog-dashboards.mjs`,
  `neon-cost-diagnostics.mjs` (+ coderabbit scripts referenced only by each other — verify).
- Fix stale `EXTENSION_DISPLAY_VERSION "0.5.0"` → derive from package.json at build time
  (`control-panel.tsx:140`).

### C. Decompose `control-panel.tsx` (5,121 lines)
- Extract along existing seams: OTP widget, billing, active-project state, capture
  settings, assistant results, context preview, usage. One hook per concern
  (`useBillingStatus`, `useActiveProjectState`, `useCaptureSettings`, `useUsageMetrics`);
  presentational sections as separate files. Target: no component >300 lines.
- The state machine already half-extracted in `control-panel-state.ts` becomes the owner.
- Pure refactor: no behavior change; extension unit tests + manual smoke on dev stack.

### D. Hosted MCP extraction
- `apps/web/src/app/api/mcp/stream/route.ts` (1,203 ln): extract `server/mcp-hosted/`
  module, one file per tool mirroring `packages/mcp/src/tools/*`; route becomes <50-line
  adapter. Share tool semantics between local and hosted registries where identical.

### E. Chat client dedup
- Extract headless `useAssistantChatCore` (shared or tiny package) parameterized by
  transport/storage; web + extension keep only surface-specific bits. Unify attachment
  DTO types.

### F. Smaller consolidations
- CLI vs wizard auth routes → one parametrized handler pair.
- `RELAY_FLUSH_BASE_COMMAND` single source of truth.
- Error vocabulary normalization (`Unauthorized.` variants) via shared helper;
  replace 65 stray `console.*` in web with structured logger.
- Decide fate of `cloudflare/sync-worker` duplication: after Phase 1's caching +
  contract test, either delete worker (if Vercel path is cheap enough) or formalize the
  shared core. Present recommendation to user before executing.

## Explicitly NOT in this phase
- bootstrap-service/digest-service splits (valuable but large) — schedule later if wanted.
- Any product/UX change.

## Acceptance criteria

- [ ] Web production build green (A)
- [ ] Bundle size of extension/web unchanged or smaller; no new deps
- [ ] All Phase 3 tests still green after each step
- [ ] control-panel.tsx ≤300 lines/component; file count grows, total LOC shrinks
- [ ] Worker decision recorded with rationale

## Outcome

_(fill after execution)_
