# Relay web and product hardening plan

Date: 2026-04-13
Status: post-backend, pre-frontend hardening plan

This plan covers the remaining non-core architecture concerns raised after the main backend roadmap:
- missing product features versus other tools
- CLI de-emphasis
- docs / pricing / settings / legal updates
- Next.js/Vercel efficiency work

## 1. What Relay may still be missing

Compared to stronger memory tools and platforms researched, Relay still likely needs later:

### A. Better review UX for machine truth
- stronger tentative-update review surfaces
- conflict comparison UI
- explicit lock-conflict explanation UI

### B. Better provenance UX
- source drawer
- why-this-is-true panel
- historical truth browser

### C. Better team story
- shared workspace canon
- seat-based access control
- audit trail by user/agent

### D. Better product hardening
- fix Relay MCP 429 issue
- clearer environment / migration diagnostics
- compaction visibility and reversibility UI
- reasoning/evidence visibility for temporal and multi-session questions

### E. Better packet observability
- packet freshness
- packet source layers
- packet generation reason / renderer / mode

## 2. CLI recommendation

If MCP is the real focus, recommendation is:
- de-emphasize CLI now
- remove CLI from primary website copy and onboarding
- keep code support only until product strategy fully commits to removal

Do **not** rush destructive CLI removal until you decide:
- whether any users depend on it
- whether internal workflows still use it

### Phase A - de-emphasize, do not delete
- remove CLI from top-level marketing claims
- prioritize MCP in docs navigation and pricing copy
- mark CLI as advanced/legacy/secondary if still visible

### Phase B - remove if desired later
- CLI docs
- wizard references
- CLI auth/token UI
- installation docs
- pricing mentions

## 3. Vercel/Next.js optimization direction

The target is not “Hobby forever.”
The target is “be efficient enough that early low-scale usage is cheap and stable.”

### Immediate principles
- static docs/marketing wherever possible
- minimal client JS for public pages
- lazy-load dashboard-heavy surfaces
- avoid polling by default
- prefer fetch-on-demand / manual refresh for admin-ish data
- paginate large memory/activity lists
- keep server actions and API calls coarse-grained, not chatty

### Specific areas to audit

#### Marketing/docs/pricing
- ensure static rendering where possible
- remove unnecessary client components
- optimize images/fonts/scripts

#### Dashboard/project pages
- split heavy lists
- virtualize if needed later
- avoid loading full memory/activity/canon/session payloads at once
- fetch tabs independently

#### Extension/browser handoff pages
- keep minimal
- avoid unnecessary hydration-heavy components

#### API patterns
- avoid extra bootstraps on page load if cache or latest packet exists
- avoid background refresh churn on every open tab

### Recommendation on Hobby
- do not plan around Hobby as a true production tier
- but yes, optimize enough that early low traffic can fit cheaply if needed
- once real usage starts, move to the cheapest plan that matches actual risk, not vanity savings

## 4. Docs / pricing / settings / legal changes needed

### Pricing
- update all copy to `Free / Starter $12 / Pro $18`
- emphasize autonomy and canon, not storage

### Settings
- use the now-existing project settings backend for autonomy/truth controls
- add usage visibility later

### Docs
- add canon/truth/current-vs-historical/packet-mode docs
- de-emphasize CLI if MCP-first strategy holds

### Terms / privacy / legal
- align product claims with current autonomy behavior
- clarify tentative updates and retained archived/demoted memory if needed

## 5. Recommended next product phases after current backend work

### Phase 1
- UI handoff and implementation

### Phase 2
- docs/pricing/settings/legal copy update pass

### Phase 3
- packet observability and provenance UI

### Phase 4
- platform hardening:
  - Relay MCP 429 fixes
  - environment diagnostics
  - benchmark/dev env consistency

### Phase 5
- decide CLI fate

## 6. What should be done now vs later

### Do now
- UI handoff spec
- backend done state checkpointing
- docs/pricing/legal/settings audit plan
- de-emphasize CLI in planning

### Do later
- actual CLI removal
- full legal review
- Vercel-level performance tuning once frontend changes land
- MCP 429 platform fixes

## 7. Final recommendation

Relay is already much stronger on backend architecture now.

The biggest remaining risks are no longer “can the backend do it?”
They are:
- whether the UI makes truth/autonomy understandable
- whether docs/pricing explain the product clearly
- whether free tier stays disciplined
- whether platform rough edges like MCP 429 undercut trust

So the right next move is not another deep backend rewrite.
It is frontend/docs/product hardening on top of the backend that now exists.
