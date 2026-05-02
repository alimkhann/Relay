# Temporal and knowledge-update improvement plan

Date: 2026-04-13
Status: implementation plan

This plan is based on the latest Oracle results and the current Relay codebase after the reasoning-aware retrieval phase.

Current benchmark picture:
- best Oracle result so far: `78.4%` with `gpt-4o-mini`
- strongest categories: single-session assistant/user
- weakest categories still:
  - `temporal-reasoning`
  - `knowledge-update`
  - some `multi-session` aggregation/composition

## 1. What is already implemented

These should not be re-designed from scratch.

### Shared query routing
- `packages/shared/src/utils/query-analysis.ts`
- recognizes:
  - `aggregation`
  - `temporal_compare`
  - `temporal_arithmetic`
  - `current_state`
  - `historical_state`
  - `preference`

### App query decomposition
- `apps/web/src/server/services/query-decomposition-service.ts`

### App reasoning scaffolding
- `apps/web/src/server/services/reasoning-assembly-service.ts`
- already exposes:
  - `currentPreviousHint`
  - `evidenceTable`

### Benchmark retrieval scaffolding
- `benchmarks/longmemeval/src/reasoning.ts`
- `benchmarks/longmemeval/src/retrieve.ts`
- already does:
  - wider budgets for temporal/aggregation modes
  - session coverage diversification
  - canon + summary + state + raw memory retrieval
  - current/previous/historical canon labeling

### Product-side truth groundwork
- canon + validity windows
- compaction
- summary snapshots
- current vs historical retrieval

## 2. What is only partially implemented

### Temporal understanding is shallow
Current code can detect explicit dates and some coarse temporal patterns.
It does **not** robustly normalize:
- `10 days ago`
- `last week`
- `three months before`
- `two weeks after X`
- event-relative anchors like `before I bought the router`

### Update resolution is shallow
`currentPreviousHint` currently picks the top two canon entries by time.
It does **not** yet explicitly resolve:
- current value
- previous value
- when the change occurred
- whether the current answer should come from canon or raw evidence

### Evidence rows are still too untyped
Current reasoning tables are mostly:
- source
- when
- content

They are **not** yet structured into:
- entity
- attribute
- value
- timestamp
- current/historical marker

## 3. What is still missing

### A. Shared temporal normalization utility

Need a new shared utility in `packages/shared/src/utils/` that can:
- normalize explicit dates
- normalize relative date phrases against a reference date
- support simple event-relative anchors when enough information exists
- compute elapsed days/weeks/months deterministically

### B. Shared temporal reasoning helpers

Need deterministic helpers for:
- earliest/latest
- before/after ordering
- elapsed-time calculation
- event sorting by normalized date

### C. Stronger update-chain resolver

Need a resolver that outputs:
- `current`
- `previous`
- `changedAt`
- `history[]`

This should use canon first, then raw evidence as fallback.

### D. Typed evidence extraction

Need structured extraction from top evidence rows into normalized facts such as:
- entity
- attribute
- value
- timestamp
- current/historical flag

Initial targets should be narrow and high value:
- counts
- scores
- follower totals
- schedules/frequencies
- prices/amounts
- ownership/location state

### E. Better benchmark answer context for temporal/update questions

The answer prompt should receive not only raw snippets and a simple evidence table, but also:
- resolved temporal facts
- current/previous state block
- sorted timeline rows

This is still honest because it comes from the same retrieved evidence, just more structured.

## 4. Highest-ROI next implementation phases

### Phase A - shared temporal normalization

Files to add or update:
- `packages/shared/src/utils/temporal-normalization.ts`
- `packages/shared/src/utils/temporal-normalization.test.ts`
- `packages/shared/src/index.ts`

Core outputs:
- `referenceDate`
- `resolvedDate`
- `precision`
- `sourceText`

Should support:
- ISO dates
- month/year
- `N days/weeks/months ago`
- `last week/month/year`

### Phase B - temporal reasoning helpers

Files to add or update:
- `apps/web/src/server/services/reasoning-assembly-service.ts`
- `benchmarks/longmemeval/src/reasoning.ts`

Core helpers:
- `resolveTemporalOrder()`
- `resolveElapsedTime()`
- `sortEvidenceByResolvedTime()`
- `chooseBestTemporalRows()`

### Phase C - update-chain resolution

Files to add or update:
- `apps/web/src/server/services/reasoning-assembly-service.ts`
- maybe a dedicated helper like `apps/web/src/server/services/update-resolution-service.ts`
- benchmark mirror helper if needed under `benchmarks/longmemeval/src/`

Core outputs:
- `current`
- `previous`
- `changedAt`
- `supportingRows`

### Phase D - typed evidence extraction

Files to add or update:
- `apps/web/src/server/services/reasoning-assembly-service.ts`
- `benchmarks/longmemeval/src/reasoning.ts`

Initial typed fact families:
- numeric counters / totals
- dates
- price/amount values
- frequency statements
- ownership/location/current state

### Phase E - benchmark answer assembly upgrade

Files to add or update:
- `benchmarks/longmemeval/src/answer.ts`

Add structured sections like:
- `Resolved timeline`
- `Current vs previous`
- `Candidate facts`

Use them only when the query mode needs them.

## 5. What not to do

Do not:
- add a new agent framework
- add graph DB work
- add more broad memory architecture changes
- create benchmark-only hardcoded logic disconnected from product value
- rerun expensive benchmarks until at least Phases A-C land

## 6. Recommended execution order

1. shared temporal normalization
2. app + benchmark temporal helpers
3. update-chain resolution
4. typed evidence extraction
5. benchmark answer assembly upgrade
6. tiny paid sample rerun
7. if promising, focused subset rerun
8. only then full Oracle rerun

## 7. Expected effect

Most likely gains:
- `temporal-reasoning`
- `knowledge-update`

Possible secondary gains:
- `multi-session` where ordering/counting/update chaining matter

## 8. Product value of this plan

This is not just benchmark work.

It should also improve real Relay behavior for questions like:
- what changed?
- what is true now?
- what was true before?
- when did this change?
- which happened first?
- how long between X and Y?

That makes it both a benchmark improvement plan and a product quality plan.
