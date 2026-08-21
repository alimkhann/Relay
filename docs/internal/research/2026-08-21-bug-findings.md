# Bug Findings — xcross, Personal Routing & Frozen Cutover (2026-08-21)

Read-only investigation. No code changed.

## 1. The "xcross" — inline chip ✕ dismiss reappearing (ROOT CAUSE FOUND)

The inline capture chip is rendered by the untyped static content script
`apps/extension/static/relay-content.js` (3,419 lines — outside the TS build, untested).
The ✕ button (`relay-inline-chip__close`, :2288) calls `dismissInlineChip()` (:2183),
which sets an **in-memory-only** flag: `relayChipState.dismissed = true` (:2196).

That flag is reset in two places, either of which resurrects the chip after dismissal:

### Mechanism A — any URL change clears dismissal (primary)
`pushObservedPageState()` at :2838-2853:
```js
if (relayChipState.href !== nextHref) {
  relayChipState.href = nextHref;
  relayChipState.dismissed = false;   // ← resurrection
  ...
}
```
On every supported AI site, the href changes exactly when a fresh chat becomes a real
conversation (`/` → `/c/<uuid>` on ChatGPT, `/app` → `/app/<id>`, etc. — route-kind logic
at :632-655). So: open new chat → chip appears → click ✕ → send first message → URL
upgrades → **chip reappears**. This matches "cancel it since it reappears" precisely.
Query-param/model-switcher changes and trailing-slash differences trigger it too.

### Mechanism B — background force-show overrides dismissal
`RELAY_SHOW_INLINE_CHIP` handler at :3058-3071 unconditionally sets
`relayChipState.dismissed = false` before rendering. Any background-initiated
`fresh_chat_bootstrap` or `quick_continuity` show (e.g., on service-worker wake or tab
activation) cancels the user's dismissal.

### Why the design is wrong
HANDOFF.md states intent as "× hides per-chat", but there is no per-chat identity or
persistence: `dismissed` is a content-script instance variable keyed to nothing.

### Fix direction (not implemented)
1. Key dismissal by stable chat identity (platform + conversation id / chat key), not href.
2. Persist recent dismissals in `chrome.storage.session` with a TTL (e.g., 24h) so SW
   restarts don't resurrect it either.
3. Carry a fresh-chat dismissal across the fresh→conversation URL upgrade (same identity-
   migration trick already used for project overrides — `isFreshChatKeyUpgrade`).
4. Make `RELAY_SHOW_INLINE_CHIP` respect a recent user dismissal unless explicitly
   user-invoked (⌘⇧I); distinguish "system bootstrap" from "user summon".
5. Longer term: this file should move into the typed extension source with tests — it is
   the most user-visible surface in the product and currently has zero coverage (the
   `extension-inline-chip.spec.ts` e2e is already failing/stale per HANDOFF-NEXT.md).

## 2. Personal routing — state of play

Context: personal routing = deciding whether captured content lands in the user's
Personal memory (Folk taxonomy: person/company/concept/event/meeting/signals/note) vs a
project bucket. Core files: `apps/web/src/server/services/personal-memory-service.ts`,
`capture-service.ts` (`routePersonalMemory`, `autoFanOutByRelevance`),
`apps/extension/src/background/routing.ts`.

### Known documented issues (from docs/memory-v2 handoffs, still open)
- **Aggressive harvest / noise**: `routePersonalMemory` runs on every capture when
  `RELAY_PERSONAL_MEMORY_AUTOWRITE` is on; salience threshold untuned ("tune if Personal
  collects noise" — never done). Sample `memory.personal_fact_skipped` logs before tuning.
- **MCP path gap**: MCP direct `add_memory projectId:"personal"` writes a bare note — no
  Folk categorization, no About-you regeneration. Capture/agent/web-manual paths are covered.
  This is likely a visible "personal routing is broken" symptom for MCP users.
- **Open semantic decision**: About-you override-wins (edit pins until "Reset to auto")
  vs merge — was never decided by the owner.
- **Whole-session→Personal routing was tried and reverted** (`77643a8` → `9a096a4`);
  item-level harvest is the settled layer. Don't reopen without new evidence.

### Never-verified behaviors (the actual suspected bug sources)
HANDOFF-NEXT.md §"NOT verified — DO THESE FIRST" lists four checks that were **never run**:
1. Personal stays selected through the first answer on a FRESH chat
   (`isFreshChatKeyUpgrade` override migration in `pickPreferredProjectId`).
2. Auto-capture into a deliberately-selected Personal actually saves.
3. Multi-project "also save to" chevron end-to-end (links ≠ digests; drain must run,
   budget not tapped).
4. MCP `"personal"` alias fetch/save round-trip.

If personal routing "still misbehaves," these are the first suspects — the fixes were
written but the verification pass lapsed when work stopped in June. Reproduce each on a
dev stack before touching code.

### Structural risk
Prod runs pre-memory-v2 schema (migration 0039) with flags dark; dev branch has migrations
0040–0055 applied and autowrite ON. Prod and dev are now behaviorally different products.
Every "personal routing bug" report is ambiguous until cutover happens or is formally
abandoned (see strategy doc — recommend deciding this first).

## 3. The frozen cutover (biggest process finding)

- `feat/memory-v2-architecture` (PR #35): Phases 1–4 complete, reviewed by CodeRabbit,
  mostly merged to main — but the branch's final commit `e068752` ("cutover readiness —
  extension 0.6.0, launch analytics, Phase 5 tooling, Phase 6 rollout") is **still unmerged**
  (main is 54 commits ahead of the merge base).
- Prod DB sits at migration 0039; 0040–0055 unapplied. Migrations were reshaped in place
  mid-stream (0040 renamed, others deleted) — HANDOFF warns "do NOT apply 0040–0052
  unchanged"; Phase 5 tooling exists only on that stale branch.
- Flags dark in prod: `RELAY_PERSONAL_MEMORY_AUTOWRITE`, `RELAY_MULTI_PROJECT_CAPTURE`,
  `RELAY_MEMORY_PIPELINE_FULL`.
- RLS in prod is decorative; app-level member checks are the real enforcement until the
  F3 RLS swap runs.

**Consequence:** two months of finished architecture work delivers zero value while
diverging from main's auth hotfixes. This is the single highest-leverage decision pending:
either execute the cutover runbook (Phase 5 tooling from `e068752` + migrations + flag
soak) or formally kill memory-v2 and delete the branch. Limbo is the worst option and it
is the current one.

## 4. Auth fragility (adjacent, conversion-relevant)

~20 consecutive auth hotfixes landed May–June (Google callback session establishment now
has four layered fallback strategies in `api/integrations/google/callback/route.ts:141-163`;
cross-domain cookie sharing bolted on; three sign-out fixes). It works, but:
- Fallback usage isn't emitted to PostHog — nobody knows how many sign-ins ride on the
  last-resort manual path.
- The internal-POST-to-auth-handler pattern is duplicated in `auth/browser-handoff/route.ts:21-52`.
- None of google/local auth services have unit tests.
Treat as: stabilize + instrument, then simplify to one session-establishment path.
