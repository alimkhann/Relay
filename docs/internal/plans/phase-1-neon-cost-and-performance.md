# Phase 1 — Neon Fast & Nearly-Free (+ backend de-bloat)

Goal: cut active compute-hours drastically (baseline: ~212h/month, Aug 2026) without
touching data, keeping Neon free/cheap tier. De-bloat the three backend surfaces:
Neon calls, Vercel serverless, Cloudflare worker.

## Evidence baseline (2026-08-21, record before/after)

| Metric | Value |
|---|---|
| Active hours / month | 763,208 s ≈ 212 h |
| CPU seconds / month | 197,032 |
| Seq scans `project_members` | 111,804,758 |
| Seq scans `project_bindings` | 4,009,989 |
| Unused embedding indexes | `idx_memory_items_embedding` 11MB (0 scans), `idx_observations_embedding` 10MB (0), `idx_source_chunks_embedding` 3.2MB (0), `idx_source_chunks_search` 4.7MB (2 scans) |
| Prod endpoint autosuspend | 300s; project default template 0s |
| Storage | ~150MB total (`source_turns` 83MB dominant) |

Re-measure with Neon MCP `inspect_database` at phase end and fill the table.

## Tasks

### A. Kill the hot seq scans (biggest lever)
1. Identify the exact queries: membership checks in
   `apps/web/src/server/policies/viewer.ts` + `members.filterMemberProjectIds/isMember`
   (`packages/db/src/repositories/*`) — explain why the planner seq-scans `project_members`
   (likely per-request lookup pattern or type/coercion mismatch defeating the index).
   Use Neon MCP `explain_sql_statement` on the real query shapes.
2. Fix: correct index (e.g. `(user_id)` / `(project_id, user_id)` as actually queried) or
   rewrite query. Migration via Neon MCP prepare flow (zero-downtime, additive).
3. Same treatment for `project_bindings` token lookups (SHA-256 → row) used by both
   Vercel path and CF worker.
4. Re-run EXPLAIN ANALYZE; require index scans on hot paths.

### B. Stop polling from waking Neon — Cloudflare worker caching
1. `cloudflare/sync-worker/src/index.ts`: GET `/api/extension/bindings` responses are
   highly cacheable. Add Cache API (or KV if $5 Workers plan already paid) edge cache,
   TTL 30–60s, keyed by token hash + invalidated on POST binding changes (worker-local
   invalidation via cache purge on write path).
2. Review extension poll interval for bindings (find in `apps/extension/src/background/*`)
   — align with server TTLs so polls mostly hit the edge, not Postgres.
3. Add a tiny contract test: same fixtures against worker handler and Vercel handler
   (this also starts paying down audit finding #2).

### C. Vercel serverless de-bloat
1. Inventory `vercel.json` crons + route handlers that touch DB per-request where a
   response could be cached (`unstable_cache` tags already exist — verify memory/dashboard
   reads actually hit them).
2. Confirm no cron runs at high frequency without need (daily aggregate drain is fine;
   anything sub-hourly must justify itself against wake-cost).
3. Check cold-start weight of hottest routes (avoid importing heavy modules into route
   entrypoints); keep fixes minimal — deep restructuring belongs to Phase 4.

### D. Compute config
1. Prod endpoint autosuspend 300s → 60s (Neon console/MCP; safe, reversible). Record CU
   range stays 0.25–2.
2. OPTIONAL (ask user first): `CREATE EXTENSION IF NOT EXISTS neon;` to enable
   working-set/LFC monitoring checks going forward.

### E. Verified index pruning (needs explicit user yes in-session)
1. Grep code paths for vector search usage (`embedding` ordering, `<=>` operators,
   `idx_*_embedding`) — confirm whether recall/similarity ever executes in prod paths
   today (flags state from Phase 0 banner matters here).
2. Only indexes confirmed unused by BOTH pg_stat (0 scans since stats reset) AND code
   audit are dropped — each with its own migration + snapshot beforehand.
3. Never drop unique/FK-supporting indexes. Never touch table data.

### F. Local dev
- Keep `docker-compose.local.yml` flow as-is for development. No prod-to-local migration.

## Acceptance criteria

- [ ] Hot auth/bindings queries use index scans (EXPLAIN evidence in this doc)
- [ ] Bindings GET served from edge cache ≥ most polls (worker logs or reasoning documented)
- [ ] Active compute-hours trend measured after 48h+ (note: partial evidence OK at phase
      end; final proof needs a week)
- [ ] Autosuspend 60s set; no app-visible behavior change
- [ ] Any dropped index has: code-audit note + snapshot + user sign-off recorded here
- [ ] `pnpm test:stable`, typecheck, lint green

## Outcome

_(fill after execution)_
