# Benchmark rerun plan

Date: 2026-04-13

## Current state

- harness now uses more of Relay's newer architecture
- it is still local-source and should use explicit local DB targeting
- current code and latest migrations must always be verified before reruns

## Before rerun

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm build`
4. `MIGRATION_DATABASE_URL=... node scripts/db-admin.js migrate`
5. `DATABASE_URL=... RELAY_TEST_USER_ID=... DRY_RUN=1 pnpm bench:longmemeval:preflight`

## Recommended spend strategy

- do not rerun full Oracle unless there is enough budget cushion
- first rerun a tiny real sample
- then decide whether full Oracle is worth it

## Budget guidance

- minimum comfortable for full rerun + judging: roughly low-single-digit dollars with cushion
- do not start a full rerun if credits are too tight to survive retries or judge costs
