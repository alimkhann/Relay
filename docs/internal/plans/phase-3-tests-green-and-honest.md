# Phase 3 — Tests: Green AND Honest

Goal: full suite green, CI blocking again, and the test suite challenges correctness
instead of blessing whatever the code currently does.

## Rules (non-negotiable)

1. A test that exists only because the code behaves that way gets deleted or rewritten
   to assert the CONTRACT (expected behavior from product/UX intent), not the output.
2. No new mock-heavy tests that restate implementation details.
3. Stale ≠ failing-only: a stale test that documents obsolete UX is deleted, not patched
   to pass, unless the behavior is still wanted.

## Tasks

### A. Triage existing failures
- `tests/e2e/extension-inline-chip.spec.ts` — stale UI + racy Plasmo rebuild
  (HANDOFF-NEXT). Rewrite against Phase 2's fixed chip behavior or delete with note.
- `dashboard-content.test.tsx` — fails 3/3 on clean HEAD (Tooltip provider). Fix the
  test setup (provider wrapper) — this one is a setup bug, not a contract issue.
- Run full `pnpm test`; catalogue every failure into: fix / rewrite / delete with reason.

### B. Contract tests for untested critical services (37 of ~57 untested)
Priority order (highest blast radius first):
1. `google-auth-service` + `local-auth-service` + `auth-sync-service` — session
   establishment, fallback ordering, cookie semantics.
2. `rate-limit-service` — limits actually limit; boundary values; clock skew.
3. Quota paths (`charge-viewer-write-quota`) — over-limit rejected, idempotency.
4. `billing-service` neighbors — webhook replay safety, entitlement transitions.
5. `memory-service` core invariants (personal vs project isolation).
Write from documented/intended behavior first; where intent is ambiguous, ASK rather
than encode guesses. Each service: happy path + 2–3 adversarial cases max. No coverage
theater.

### C. Make CI honest again
- `.github/workflows/ci.yml:51,79` set `continue-on-error: true` on full-suite and e2e
  jobs. After A+B stabilize: remove both flags so they block.
- Keep `retries: 0` but fix the dead `trace: on-first-retry` config (set `trace:
  retain-on-failure` or add retries deliberately).
- E2E webServer: switch Playwright from `next dev` to a production build start
  (`next build && next start`) for realistic gates if runtime allows on free tier;
  otherwise document why dev-mode stays.

## Acceptance criteria

- [ ] `pnpm test` fully green locally and in CI
- [ ] Every deleted/rewritten test has a one-line justification recorded here
- [ ] New contract tests exist for the five priority areas above
- [ ] CI jobs blocking (no continue-on-error); one green CI run on the PR

## Outcome

_(fill after execution)_
