# Relay Launch Implementation Plan

Last updated: 2026-03-19

## Purpose

This file is the handoff document for finishing Relay for launch as fast as possible without re-spending a large token budget on rediscovering the codebase and product decisions.

It is split into:
- GPT 5.4 backend / logic / systems work
- Claude Opus 4.6 frontend / UX / docs / design work

This file should be paired with Nia context memory so future sessions can recover both:
- the architectural state of the app
- the exact launch plan and billing decisions

## Current Product State

Relay's main continuity engine is already substantially implemented.

### Core backend continuity already in place

- browser capture pipeline
- deterministic + AI digest pipeline
- project state derivation
- bootstrap / brief generation
- autonomous MCP work sessions
- work session events + checkpoints
- browser digest -> work session checkpoint propagation
- truth scoring that is not freshness-only
- stale-session recovery
- grouped quick continuity deltas
- canonical handoff generation through bootstrap flow
- MCP token audit basics
- continuity maintenance / reconciliation loop
- browser thread promotion from provisional URL identity to canonical conversation identity

### In practical terms

The app is no longer just “save notes and hope”.

It now behaves like:

1. raw evidence
   - browser captures
   - MCP actions
   - digests
   - work session events/checkpoints

2. work session substrate
   - MCP auto-opens sessions
   - meaningful state changes are checkpointed
   - sessions close best-effort

3. durable truth
   - project_state
   - curated memory
   - truth scoring using authority, durability, validation, reaffirmation, evidence, freshness as tie-breaker

4. output layer
   - fresh chat bootstrap
   - quick continuity
   - handoff packs / packets

### Backend areas still worth hardening later

These are no longer blockers for the core continuity engine, but they still exist:
- richer explicit conflict entity model instead of metadata-only disputes
- stronger browser/extension promotion confidence model using more routing evidence
- deeper validation / regrounding jobs for checkpoint quality
- broader observability and operational analytics

## Launch Strategy

Launch is now mostly about:

1. monetization and protection
2. user-facing product readiness
3. cost / reliability discipline

The core continuity architecture should be considered good enough to productize.

## Billing Decisions Confirmed

These are final unless explicitly changed later:

### Plan structure

- Monthly Pro and Yearly Pro
- Same feature set for monthly and yearly Pro
- Yearly is only pricing / retention economics, not a different entitlement shape
- Future team plan should be easy to add, but do not implement team now

### Trial

- Short 7-day Pro trial
- Prefer configuring trial in Polar if possible
- Must defend against trial abuse
  - check payment method / card fingerprint if Polar supports it
  - also apply IP / device / account heuristics in Relay

### Free plan

- 2 active projects
- 30-day history retention
- MCP read + limited write
- useful enough to feel real
- not generous enough to become free infra for power users

### Pro plan

- 10 active projects
- full MCP read + write
- handoff packs enabled
- much higher limits, but still bounded

### Limits UX

- hard caps in backend
- warning UI at 70% / 85% / 100%

### Referrals

- defer until after launch

### Billing management

- use Polar customer portal
- do not build custom subscription management first

## Polar Setup Confirmed

Use the current web app as the billing host.

### Webhook default

Use:

`https://www.onrelay.app/api/webhooks/polar`

Do not use `https://api.onrelay.app/webhooks/polar` unless a separate production API service is intentionally introduced later.

### Polar env vars available

The following variables are available and should be used from environment, not copied into docs/context memory with secret values:

- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_ORGANIZATION_ID`
- `POLAR_ORGANIZATION_SLUG`
- `POLAR_PRODUCT_ID_PRO_MONTHLY`
- `POLAR_PRODUCT_ID_PRO_ANNUAL`

Do not store raw secret values in long-lived context memory.

### Billing architecture rule

- Polar handles checkout, portal, invoices, trial mechanics, and subscription events
- Relay DB is the runtime source of truth for entitlements and access
- Hot-path product access checks must not depend on live Polar API calls

## PostHog Analytics Plan

PostHog should be added across all main product surfaces.

### Surfaces

1. Web app - landing
2. Web app - dashboard/app
3. Extension
4. MCP / CLI / server-side tool usage

### Web app tracking

Landing should track:
- landing_page_viewed
- pricing_viewed
- get_started_clicked
- docs_clicked
- billing_upgrade_clicked

Dashboard/app should track:
- dashboard_viewed
- project_opened
- brief_generated
- quick_continuity_requested
- handoff_generated
- settings_viewed
- billing_portal_opened
- usage_limit_warning_shown
- usage_limit_block_shown
- upgrade_cta_clicked

### Extension tracking

Track:
- extension_installed
- extension_authenticated
- project_bound_to_tab
- capture_submitted
- capture_deduped
- browser_handoff_started
- brief_inserted
- extension_limit_warning_shown
- extension_upgrade_cta_clicked

### MCP / CLI tracking

Track server-side via PostHog Node SDK:
- mcp_session_opened
- mcp_brief_read
- mcp_context_saved
- mcp_memory_added
- mcp_limit_warning_shown
- mcp_limit_blocked
- cli_install_completed
- cli_auth_completed
- cli_project_selected

### Identity rules

- identify logged-in users by Relay user ID
- group by project when useful
- avoid storing secret payloads, full transcript content, or sensitive auth artifacts
- keep event names action-oriented and stable

### Privacy / safety

- never send raw chat transcripts to analytics
- never send tokens, OAuth secrets, or full memory contents
- analytics should record usage patterns and conversion signals, not private content

## GPT 5.4 Track - Backend / Logic / Systems

## Phase 1 - Polar Billing Core

Goal: safe and reliable subscription system.

Implement:
- billing customers table
- subscriptions table
- entitlements table
- usage counters table
- webhook event log / idempotency table

Core APIs:
- create checkout session
- open customer portal
- billing status
- webhook receiver
- entitlement sync / reconciliation

Rules:
- use webhook-verified state, not redirect success alone
- store Polar customer external_id as Relay user ID
- support monthly/yearly Pro only

## Phase 2 - Entitlements Layer

Create a single entitlement resolver, something like:

`resolveViewerEntitlements(userId)`

It should return:
- plan
- trial status
- active subscription status
- active project limit
- history retention days
- capture quota
- MCP read quota
- MCP write quota
- handoff enabled/disabled
- hard block reasons

Use it in:
- project creation
- capture ingestion
- MCP routes
- bootstrap/handoff routes
- token issuance
- dashboard/settings usage APIs

## Phase 3 - Product Gating

Implement real backend enforcement for:
- project count
- history retention
- MCP read/write access levels
- handoff packs
- expensive AI/continuity generation paths where relevant

Free should feel useful, but limits should be real.

## Phase 4 - Trial Abuse Protection

Required anti-abuse protections:
- one trial per billing identity if Polar exposes payment method fingerprinting / duplicate-customer safeguards
- one trial per Relay user
- IP/device heuristics for suspicious repeated trial creation
- do not unlock trial access from client redirect alone

If Polar can configure trial at checkout/product level, prefer that. If not, configure trial in checkout session creation.

## Phase 5 - Rate Limiting / Abuse Controls

Layered rate limiting:
- per IP
- per user
- per token
- per endpoint class

Important endpoint classes:
- auth/token issuance
- MCP endpoints
- extension capture endpoints
- billing endpoints
- expensive continuity generation endpoints

Need hard 429s and machine-readable responses.

## Phase 6 - Usage Counters

Track at minimum:
- active projects
- monthly captures
- daily MCP reads
- daily MCP writes
- monthly handoff generations
- active tokens/devices

Need both:
- enforcement path
- reporting path for dashboard/settings UI

## Phase 7 - Retention / Cleanup / Reconciliation

Implement jobs for:
- free-plan history pruning after 30 days
- usage counter reset windows
- stale token/session cleanup
- billing reconciliation
- downgrade handling

Recommended downgrade behavior:
- if usage exceeds free limits after downgrade, keep data but force user to reduce to allowed limit before normal usage resumes
- avoid destructive immediate deletion when possible

## Phase 8 - Cost / Reliability Hardening

Goal: reduce Vercel pressure.

Backend strategy:
- validate fast, enqueue heavy work
- batch writes where possible
- reduce hot-path heavy work
- cache entitlement + usage summaries
- keep Vercel as control plane
- move sustained heavy workloads to queue/worker style if needed later

Main cost hotspots to watch:
- extension polling frequency
- project summary queries fanout
- sync / checkpoint write amplification
- synchronous AI/bootstrap work in request path

## Claude Opus 4.6 Track - Frontend / UX / Docs

## Phase A - Billing UX

Implement:
- pricing to checkout flow
- settings billing page/section
- current plan card
- trial state
- renewal / cancellation status
- manage billing button -> Polar portal

## Phase B - Upgrade / Limit UX

For these cases:
- project cap hit
- capture quota hit
- MCP read cap hit
- MCP write cap hit
- handoff pack gated
- retention/history gated

Show:
- what happened
- why
- what the upgrade unlocks
- CTA to upgrade

Must include warning states at:
- 70%
- 85%
- 100%

## Phase C - Dashboard Usefulness

Still needed:
- usage overview
- plan overview
- recent sync / recent work session visibility
- delta/handoff usefulness surfaces
- provenance / freshness / conflict indicators
- better activity compression UI

## Phase D - Settings UX

Need:
- MCP/API token UX refresh
- usage + limits section
- billing + plan section
- connected device/client visibility
- retention explanation

## Phase E - Docs

Launch docs should cover:
- what Relay is
- extension setup
- MCP setup
- plans/limits
- retention
- troubleshooting
- privacy/data behavior
- cancellation/downgrade behavior

## Phase F - Extension UX Remaining

Still useful after billing/docs:
- memory subtabs
- provenance chips
- sync status polish
- limit UX
- conflict/freshness indicators

## Phase G - Remaining Product UX

Later:
- full single-page get-started animated transition
- richer docs layout
- handoff/delta UI polish
- explicit conflict UX

## Launch Order

1. GPT 5.4
   - Polar backend
   - entitlements
   - gating
   - rate limits
   - usage counters

2. Claude Opus 4.6
   - billing UX
   - upgrade UX
   - settings UX

3. GPT + Claude
   - docs
   - dashboard usefulness
   - usage visibility

4. GPT 5.4
   - billing hardening
   - retention jobs
   - abuse controls
   - ops tuning for Vercel cost

5. Claude Opus 4.6
   - final polish

## What Remains After Launch Core

After monetization/docs/dashboard readiness, the next big items are:
- referrals
- richer conflict UX
- more advanced continuity validation jobs
- stronger analytics dashboards
- productivity integrations:
  - Gmail
  - Calendar
  - Notion
  - Linear
  - Slack
  - other personal/work systems

These are explicitly post-launch.

## Instructions For Future AI Coding Sessions

When starting a fresh session, do this first:

1. Search Nia contexts for this launch plan and latest implementation state.
2. Read the saved context before inspecting the codebase deeply.
3. Treat this file as the project launch roadmap.
4. Do not re-index the repo if the Nia context is enough for the immediate task.

Recommended prompt to a future coding agent:

"Before doing anything else, use Nia to restore the Relay launch context. Search for the saved Relay launch implementation context and read it first, then continue from that state instead of re-exploring the codebase from scratch."

Recommended Nia commands:

```bash
nia contexts search "Relay launch implementation plan" --agent gpt-5.4 --limit 5
nia contexts search "Polar billing free pro gating Relay launch" --limit 5
nia contexts get <context-id>
```

## Important note on secrets

Do not store raw Polar secrets, webhook secrets, or other credentials in long-term plan files or Nia context. Only store env var names and integration structure.
