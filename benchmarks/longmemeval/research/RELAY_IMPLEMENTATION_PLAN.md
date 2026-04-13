# Relay Implementation Plan

Date: 2026-04-12
Status: execution-ready
Owner: Relay core product / infra

This document converts the research in `benchmarks/longmemeval/research/SYNTHESIS.md` into a phased implementation plan for Relay.

The goal is not only to improve LongMemEval performance, but to make Relay trustworthy enough to become the default continuity layer between browser AI chats and coding agents.

## 1. Product and pricing decisions

### Positioning

Relay should be sold as:
- autonomous continuity across browser AI and coding agents
- trusted project canon and project state
- provenance-backed context carry, not generic chat memory

### Pricing

- `Free`
- `Starter $12`
- `Pro $18`
- `Team` later

### Plan differentiation

Do not differentiate mainly on storage or raw quotas.

Differentiate on:
- trusted canon maintenance
- autonomy quality
- reflection frequency
- deep-read quality
- project-state packet quality

### Usage model

Split reads into two classes:

- `basic reads`
  - deterministic retrieval
  - cached canon/project state
  - low token cost
- `deep reads`
  - fresh synthesis
  - richer packet assembly
  - more expensive reasoning

This split is required to keep `Starter $12` viable.

### Recommended limits

These numbers are starting points, not final pricing-law.

#### Free
- `2` active projects
- `7-14` day retention
- `100-150` captures/month
- `100-150` memory items
- `20-30` deep reads/month
- `20-30` analyses/month
- limited autonomous summaries

#### Starter
- `8-10` active projects
- `180-365` day retention
- `800-1200` captures/month
- `1000-1500` memory items
- `150-250` deep reads/month
- `75-125` analyses/month
- standard synthesis model
- moderate autonomous canon upkeep

#### Pro
- `10-20` active projects
- `365` day retention
- `1500-2500` captures/month
- `2500-4000` memory items
- `350-600` deep reads/month
- `150-250` analyses/month
- better synthesis model
- more frequent reflection
- stronger autonomous canon upkeep

### Discount policy

- standard promo: `10-15%`
- launch/founding user promo: `20%` for `6-12 months`
- private tester/friends ceiling: `25-30%`, time-limited only
- never stack discounts
- avoid permanent deep discounts

## 2. North star architecture

Relay should become the system that can answer:
- what is true now
- what used to be true
- why Relay believes that
- what changed
- what is uncertain
- what the agent should do next

Target pipeline:

`capture -> memory items -> observer -> canon/facts/summaries -> hybrid retrieval -> valid-time and conflict filtering -> rerank -> packet assembly for chat or agent`

## 3. Current architecture: keep vs evolve

Current strengths:
- `memory_items` already store provenance, embeddings, captured time, decay, and derived lineage
- `memory_relations` already include `supersedes`
- `project_state` exists and is already exposed through Relay MCP
- digests / bootstrap packets / work sessions already exist

Current limitations:
- project truth is too coarse: `decisions`, `constraints`, and `openTasks` arrays are not enough for autonomous canon
- current memory item types are capture-oriented, not canon-oriented
- there is no first-class tentative/disputed canon state
- current retrieval is not explicitly current-vs-historical aware
- browser and agent packets are not yet clearly separated by surface intent

Recommendation:
- keep current tables as the base
- add a canon/truth layer above them
- migrate behavior gradually instead of replacing everything at once

## 4. Schema evolution plan

### 4.1 Keep existing base tables

Keep:
- `memory_items`
- `memory_relations`
- `project_state`
- `project_state_override`
- digests / packets / work sessions

### 4.2 Add new canon layer

Add `canon_entries`:
- `id`
- `project_id`
- `kind`
  - `objective`
  - `decision`
  - `constraint`
  - `task`
  - `progress`
  - `artifact`
  - `architecture_fact`
  - `risk`
  - `assumption`
  - `question`
- `title`
- `content`
- `status`
  - `active`
  - `tentative`
  - `superseded`
  - `disputed`
  - `stale`
  - `resolved`
- `confidence`
- `locked_by_user`
- `auto_generated`
- `valid_from`
- `valid_until`
- `last_verified_at`
- `supersedes_entry_id`
- `metadata`
- `created_at`
- `updated_at`

Add `canon_evidence`:
- `id`
- `project_id`
- `canon_entry_id`
- `source_kind`
  - `memory_item`
  - `source_turn`
  - `session_digest`
  - `artifact`
  - `url`
  - `manual`
- `source_id`
- `excerpt`
- `weight`
- `created_at`

Add `project_summary_snapshots`:
- `id`
- `project_id`
- `kind`
  - `session_summary`
  - `project_summary`
  - `current_focus_summary`
- `content`
- `derived_from`
- `generation_metadata`
- `created_at`

Optional phase-later additions:
- `fact_records`
- `canonical_entities`

### 4.3 Do not expand raw memory item types first

Current `memory_items` types are:
- `note`
- `decision`
- `constraint`
- `requirement`
- `task`
- `artifact`

Recommendation:
- keep these for raw capture and compatible APIs
- use `canon_entries.kind` for the richer typed model

## 5. Truth resolution policy

### Precedence order

1. user-locked canon
2. user-edited canon
3. approved canon
4. high-confidence auto canon
5. derived facts
6. raw evidence

### Additional weighting

Use alongside precedence:
- validity window
- freshness
- evidence count
- source diversity
- contradiction score
- source quality

### Required behavior

- user-edited canon remains mutable unless explicitly locked
- if locked canon conflicts with new evidence, Relay must surface that the lock is the reason the truth did not update
- risky strategic truths must not be silently replaced
- all canon must remain evidence-linked

## 6. Surface-specific context packets

Relay should not send one universal brief.

### Browser AI chats

Use slim ideation packets:
- `chat_new`
- `chat_continue`

Include:
- project overview
- current objective
- top active decisions
- top constraints
- recent progress / current focus
- key open questions

Avoid:
- long evidence trails
- noisy activity lists
- too many low-level tasks
- code snippets by default

### Coding agents

Use richer execution packets:
- `agent_quick_continuity`
- `agent_full_bootstrap`

Include:
- project overview
- objective
- recent progress
- active decisions
- active constraints
- open tasks
- relevant tools
- key artifacts
- unresolved conflicts
- tentative machine updates
- small code snippets when directly relevant

### Extension insert UX

One main button:
- new chat -> default to `New`
- existing chat -> default to `Continue`

Add a small chevron/dropup to choose alternate packet types.

## 7. Product entry points

### Keep

- extension auto-capture
- extension save
- extension insert
- MCP tools

### Strengthen or add

- first-class `project canon read`
- first-class `project state read`
- `why does Relay believe this?`
- `show conflicts and tentative truths`
- packet generation by target surface

## 8. Phased implementation roadmap

Rule for all phases:
- do not start the next phase until the current phase is implemented, tested, built, and checkpointed in Relay MCP

### Phase 1 - Canon and truth foundation

Goal:
- create a trustworthy project canon substrate

Implement:
- DB schema for `canon_entries`, `canon_evidence`, `project_summary_snapshots`
- shared types and zod schemas
- repositories and service layer
- tentative/disputed/superseded/stale statuses
- lock/unlock behavior
- precedence rules
- migration path from current `project_state`
- first-class canon read and write APIs

Adapt from research:
- Graphiti valid-time contradiction handling
- Hindsight layered truth model
- OMEGA structured hybrid truth signals

Tests required:
- precedence resolution tests
- lock conflict tests
- tentative update tests
- migration tests
- evidence-link integrity tests
- API integration tests

Exit criteria:
- no silent overwrite of locked user canon
- canon APIs are usable and trustworthy
- existing `project_state` behavior still works

### Phase 2 - Retrieval V2

Goal:
- materially improve current-state, historical-state, and multi-session retrieval

Implement:
- query decomposition
  - entities
  - dates
  - current vs historical intent
  - project-state vs evidence intent
- multi-layer candidate generation
  - canon
  - summaries
  - memory items
  - artifacts/evidence
- conflict-aware filtering
- valid-time filtering
- improved ranking and context assembly

Adapt from research:
- OMEGA hybrid retrieval + temporal handling
- Graphiti/Hindsight current-vs-historical distinction
- RAPTOR retrievable summaries

Tests required:
- current-state queries
- historical-state queries
- contradiction-aware retrieval
- multi-session retrieval tests
- latency tests
- basic vs deep read routing tests

Exit criteria:
- category lift over current retrieval
- no regression in baseline search quality
- no accidental expensive deep synthesis for basic reads

### Phase 3 - Observer / Reflector

Goal:
- make continuity autonomous without making it untrustworthy

Implement:
- observer on ingest
- reflector async summarization
- low-risk canon auto-updater
- medium-risk tentative updates
- plan-aware reflection cadence and model routing

Adapt from research:
- Mastra OM observer/reflector split
- Mastra OM stable summary + recent raw evidence pattern
- Hindsight observation layering

Tests required:
- observer output schema tests
- reflector stability tests
- lock conflict tests
- rollback tests
- Starter vs Pro policy routing tests

Exit criteria:
- auto-updates improve quality instead of adding noise
- locked truths remain protected
- summaries remain stable and useful

### Phase 4 - Surface-specific packet generation

Goal:
- send the right context to the right surface

Implement:
- `chat_new`
- `chat_continue`
- `agent_quick_continuity`
- `agent_full_bootstrap`
- target-aware packet builder
- token-budget-aware assembly

Tests required:
- packet content tests
- packet budget tests
- browser-vs-agent differentiation tests
- fallback tests when evidence is sparse

Exit criteria:
- browser packets are concise and useful
- agent packets are detailed and operational

### Phase 5 - Metering and pricing enforcement

Goal:
- make Starter and Pro financially safe and clearly differentiated

Implement:
- `basic` vs `deep` read metering
- plan-aware model routing
- plan-aware reflection cadence
- safe free-tier enforcement
- Starter vs Pro differentiation in synthesis quality and upkeep

Tests required:
- quota counting tests
- plan routing tests
- hidden-cost path tests
- entitlement/billing semantics tests

Exit criteria:
- cost profile is predictable
- free tier is safe
- Pro differentiation is obvious and worth paying for

### Phase 6 - Evaluation harness

Goal:
- prove quality improvements on benchmark and real workflow continuity

Implement:
- `LongMemEval Oracle`
- stratified `LongMemEval_S` 50-question subset
- Relay-native continuity benchmark
  - browser ideation -> coding execution
  - evolving objectives
  - conflicting decisions
  - locked canon conflicts
  - provenance-sensitive queries
  - `what changed?`
  - `what is true now?`

Tests required:
- repeatable benchmark scripts
- category-level reporting
- regression thresholds

Exit criteria:
- benchmark progress is measurable
- Relay-native eval proves product value beyond LongMemEval

### Phase 7 - UI handoff spec

Goal:
- prepare later UI work for another model

After infra phases are stable, write a separate UI handoff `.md` for:
- Claude Opus 4.6
- with `frontend-design` skill

It should specify:
- Project Canon view
- Truth Timeline
- Conflicts / Tentative Updates
- Provenance drawer
- Autonomy settings
- Usage + Plan view
- packet preview
- extension insert chip behavior

This phase is intentionally later.

## 9. Testing policy

Every phase must end with:
- unit tests green
- integration tests green
- schema/migration tests green
- build green
- typecheck green
- lint green

No manual user testing should be required as the only exit gate.

## 10. Competitor patterns to adapt deliberately

### Adapt

- Mastra OM
  - observer/reflector split
  - compressed stable memory plus recent raw context
- Graphiti
  - historical truth remains queryable
  - close old facts via validity windows instead of deleting them
- Hindsight
  - layered memory/canon model
  - evidence-backed retrieval
- OMEGA
  - hybrid retrieval and temporal query handling
- RAPTOR
  - retrievable summary layers

### Avoid

- MemPalace benchmark-specific hacks
- heavyweight graph infra too early
- closed-source architectural guessing
- pricing that assumes every read can be expensive

## 11. Release and MCP checkpoint policy

When implementation starts:
- save the plan to Relay MCP at implementation start
- checkpoint after each completed phase
- checkpoint after major design changes
- checkpoint before handing off to another agent/model

Each checkpoint should include:
- decisions made
- schema changes
- files touched
- tests added
- blockers/risks
- next phase entry criteria

## 12. Immediate next actions

1. Save this plan into Relay MCP once work begins.
2. Implement only `Phase 1` first.
3. Do not touch UI yet.
4. Do not implement graph-heavy infrastructure yet.
5. Do not change pricing logic before `basic` vs `deep` read metering design is specified.

## 13. Phase 1 likely file targets

These are the most likely starting points based on the current codebase:

- `packages/shared/src/types/database.ts`
- `packages/shared/src/types/project.ts`
- `packages/shared/src/schemas/memory.ts`
- `packages/shared/src/schemas/project.ts`
- `packages/db/src/repositories/`
- `apps/web/src/server/services/memory-service.ts`
- `apps/web/src/server/services/`
- migration files under the DB package / migration location already used in the repo

Phase 1 should update the model first, then the APIs, then tests.
