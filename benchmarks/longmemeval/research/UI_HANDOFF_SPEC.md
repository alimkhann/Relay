# Relay UI handoff spec

Date: 2026-04-13
Audience: Claude Opus 4.6 with `frontend-design` skill
Status: backend-ready handoff for later UI work

This spec assumes the backend work completed after the original LongMemEval research pass is already present.

## 1. Product direction

Relay is no longer just a memory list.

It is now moving toward:
- trusted project canon
- autonomous continuity across browser AI chats and coding agents
- current vs historical project truth
- provenance-backed context carry
- bounded cost through `basic` vs `deep` read behavior

The UI must reflect that shift.

The user should feel:
- Relay knows what is true now
- Relay knows what changed
- Relay can show why it believes that
- Relay does not silently overwrite important truth

## 2. Backend capabilities now available

These backend changes already exist and should shape the UI.

### Canon layer

Implemented:
- `canon_entries`
- `canon_evidence`
- `project_summary_snapshots`

Canon entry kinds:
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

Canon statuses:
- `active`
- `tentative`
- `superseded`
- `disputed`
- `stale`
- `resolved`

### Retrieval improvements

Implemented:
- current vs historical query handling
- canon-aware retrieval
- summary-aware retrieval
- reasoning-aware query routing and evidence assembly for harder multi-session and temporal cases
- stronger temporal normalization and current/previous evidence hints exposed by backend search/packet logic
- packet specialization by surface

Backend search/retrieval surfaces now have richer reasoning helpers available, including:
- `evidenceTable`
- `currentPreviousHint`
- `temporalHint`

### Autonomy

Implemented:
- observer/reflector foundation
- low-risk auto-updates to canon
- medium-risk updates stay tentative instead of silently becoming truth

### Compaction

Implemented:
- canon-aware compaction/demotion of raw memory
- summary-covered note demotion/archive
- completed-task cleanup
- retrieval penalty for demoted memory states

Compaction states currently live in memory metadata:
- `covered_by_canon`
- `covered_by_summary`
- `historical_only`
- `completed`

## 3. Primary UI surfaces that now need changes

The following surfaces need updates:
- dashboard
- project detail pages
- memory page
- packets/briefs pages
- settings
- pricing/plans
- docs
- extension UX copy and packet controls
- MCP docs and onboarding
- legal pages copy updates if product behavior claims change

## 4. Design goals

Use the `frontend-design` skill, but keep these constraints:
- do not produce bland dashboard UI
- do not over-design with visual noise
- keep the product feeling trustworthy, operational, and focused
- make status, conflicts, and provenance legible
- desktop first, but mobile-safe

Tone of the UI:
- calm
- precise
- operational
- evidence-aware

Avoid:
- toy memory-app vibes
- generic AI neon nonsense
- hiding critical truth state behind decorative UI

## 5. New information architecture

### A. Dashboard

Current dashboard should evolve from generic activity/memory overview into a project-state cockpit.

Add these dashboard blocks:

1. `Current Canon`
- current objective
- active decisions
- active constraints
- open tasks
- recent progress

2. `Tentative Updates`
- machine-suggested updates not yet fully settled
- visually distinct from active canon

3. `Conflicts`
- disputed truths
- locked-truth conflicts
- stale truths needing review

4. `Context Packets`
- latest browser-chat packet
- latest agent packet
- packet freshness / last generated time

5. `Memory Health`
- active memory count
- demoted count
- archived count
- retention/budget pressure signals

### B. Project page

Project page should become the main truth-management surface.

Tabs or sections recommended:
- `Canon`
- `Timeline`
- `Memory`
- `Packets`
- `Sessions`
- `Settings`

### C. Canon page/section

Must show:
- grouped by kind
- status chips
- locked/unlocked state
- provenance availability
- valid-from / valid-until when relevant
- active vs tentative vs superseded views

Key actions:
- lock / unlock
- edit
- mark resolved
- view evidence
- compare conflicting entries

### D. Timeline / Truth Timeline

This is important and currently missing.

Show:
- when truth changed
- what superseded what
- what came from browser capture vs work session vs manual edit
- when compaction or demotion happened

This should feel like an operational audit trail, not a generic activity feed.

### E. Memory page

Memory page needs major clarification because memory is no longer all equal.

Separate views for:
- active raw memory
- demoted memory
- archived memory
- canon-covered raw memory
- summary-covered raw memory
- historical-only evidence

The user should understand:
- why an item is no longer prominent
- that it still exists as provenance

### F. Packet pages / brief pages

Need to show packet mode explicitly.

Packet modes now exist:
- `chat_new`
- `chat_continue`
- `agent_quick_continuity`
- `agent_full_bootstrap`

UI should show:
- packet type
- target surface
- freshness
- generation method
- source truth layers used

Add preview cards with copy-ready content.

## 6. Extension UX changes needed

Current direction is:
- one primary insert button
- smart default by chat state
- small chevron/dropup for alternatives

Extension UI should support:

### Main insert behavior
- new chat -> default `New`
- existing chat -> default `Continue`

### Chevron/dropup choices
- `New`
- `Continue`
- `Agent Quick`
- `Agent Full`

If browser UI cannot expose all 4 labels directly, keep user-facing labels simpler, but map to backend packet modes.

### Extension status card
Should show:
- current project
- last saved time
- captures today / quota status
- whether latest capture updated canon
- whether there are tentative updates/conflicts

## 7. Settings changes needed

Add a settings area for autonomy and trust.

### New settings sections

1. `Autonomy`
- low / standard / high guidance text
- what can auto-update
- whether tentative updates are surfaced prominently
- this now has real backend project settings support:
  - `autonomyMode`
  - `showTentativeUpdates`
  - `includeTentativeUpdatesInPackets`
  - `compactionMode`

2. `Truth Management`
- default lock behavior for edited canon
- historical truth visibility options
- compaction transparency settings

3. `Usage`
- basic reads used
- deep reads used
- writes used
- analyses used
- project cap / retention status

## 8. Pricing / plans page changes needed

The pricing page is no longer just about caps.

It should clearly explain:

### Free
- trial-like
- short retention
- limited deep reads
- limited writes
- enough to prove value

### Starter $12
- solo serious use
- trusted canon
- continuity across browser + agents
- standard autonomy

### Pro $18
- better model path
- stronger autonomous upkeep
- richer agent briefs
- more deep reads

Do not present this as “bigger storage plans.”
Present it as:
- quality
- autonomy
- project continuity depth

## 9. Docs changes needed

### Docs should be updated for:
- canon and truth concepts
- tentative vs active truth
- current vs historical truth
- packet modes
- basic vs deep reads
- memory compaction behavior
- why some memory gets demoted/archived

### Strongly recommended doc pages
- `What is Project Canon?`
- `How Relay decides what is true`
- `Current vs Historical Truth`
- `Why memory may be demoted or archived`
- `Browser packets vs agent packets`

## 10. MCP docs changes needed

MCP docs should now emphasize:
- Relay as project canon provider
- not just generic memory search
- the difference between quick continuity and full bootstrap
- provenance / conflict awareness

Also document:
- basic vs deep read semantics conceptually
- recommended agent usage patterns

## 11. Terms / privacy / legal copy changes needed

No legal rewrite is requested here, but product claims must stay accurate.

Pages to review:
- terms
- privacy
- onboarding/legal claims in extension and website

Potential copy updates needed:
- if you claim Relay “automatically maintains project state,” clarify that it may generate tentative or low-risk updates
- clarify that users can edit and lock canon
- clarify that archived/demoted memory may still be retained for continuity and provenance

This is mostly a product-copy and legal-review pass later, not a code-heavy legal phase now.

## 12. CLI de-emphasis recommendation

Recommendation:
- do not delete CLI support immediately in code unless product strategy is final
- but de-emphasize it in UI/docs now if MCP is the real focus

Suggested approach:
- remove CLI from primary marketing/navigation
- keep it in docs only if still functional
- prioritize MCP wording everywhere public
- later decide whether to fully remove CLI-related flows, tokens, wizard steps, and onboarding

If CLI removal happens later, affected areas likely include:
- docs
- pricing copy
- onboarding copy
- token management UI
- wizard references

## 13. Web/app optimization plan that UI work must respect

If the app is expected to stretch on Vercel Hobby early, frontend should avoid waste.

UI implementation should prefer:
- server-rendered/static docs and marketing pages where possible
- minimal client JS on marketing/pricing/docs
- avoid heavy dashboard bundles
- use paginated/lazy-loaded activity and memory lists
- avoid polling unless required
- use explicit refresh buttons for low-priority admin data

Do not build a UI that assumes unlimited server invocations.

## 14. Missing product features Relay still likely needs later

Compared to the strongest systems researched, Relay may still need later:
- explicit provenance drawer / source graph UX
- audit-friendly truth timeline UI
- stronger review UX for tentative/conflicting canon
- team/workspace shared canon and role-aware permissions
- richer historical “as of date” browsing UX
- eventual background compaction visibility

These are not blockers for the next UI pass, but they should influence design extensibility.

## 15. Deliverables expected from Claude Opus 4.6

When this UI phase starts, the model should produce:
- a revised IA for dashboard/project/memory/packets/settings/pricing/docs
- concrete component plan
- polished production-ready UI implementation
- extension insert UX update plan
- docs/pricing/legal copy update checklist

It should not redesign the backend contract.
It should consume the backend that now exists.

## 16. Files/surfaces that should be audited during UI phase

At minimum audit:
- dashboard pages
- project detail pages
- memory pages
- packets pages
- settings pages
- pricing/plans pages
- docs pages
- extension insert controls and status surfaces
- MCP-facing docs and onboarding copy
- terms/privacy/legal copy pages

## 17. Final instruction for the UI model

Build for trust and operational clarity.

The user should leave the UI thinking:
- “Relay understands my project.”
- “I can see what it believes and why.”
- “I can trust it, override it, and inspect it.”
- “It is not just another AI memory toy.”
