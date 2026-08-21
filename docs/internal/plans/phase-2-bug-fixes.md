# Phase 2 — Bug Fixes (xcross, personal routing, auth visibility)

Goal: fix the two user-reported bug families and make silent paths observable.
Depends on: Phase 0 (flag values known), dev stack runnable.

## A. xcross — inline chip resurrection (root cause already established)

Root cause (from 2026-08-21 investigation):
- `apps/extension/static/relay-content.js` — `dismissInlineChip()` (:2183) sets
  in-memory `relayChipState.dismissed = true` only.
- Reset #1: any href change clears it (`pushObservedPageState`, :2838-2853) — fires when
  a fresh chat upgrades to a conversation URL right after the first message.
- Reset #2: `RELAY_SHOW_INLINE_CHIP` handler (:3058-3071) force-clears dismissal on
  background-initiated shows.

Fix design:
1. Key dismissal by stable chat identity (platform + conversation/chat key), not href.
2. Persist recent dismissals in `chrome.storage.session` (TTL ~24h) so SW restarts and
   page reloads respect them; carry fresh-chat dismissal across the fresh→conversation
   key upgrade (mirror `isFreshChatKeyUpgrade` pattern used for project overrides).
3. Split show intents: user summon (⌘⇧I) always wins and clears dismissal;
   system bootstrap/quick-continuity respects a recent dismissal.
4. Add regression tests at the logic layer (extract decision into a testable pure module
   if feasible without rewriting the whole static file).
5. Update or retire stale `tests/e2e/extension-inline-chip.spec.ts` to match current UX.

Note: this file is untyped static JS outside the build. Keep the diff surgical now; its
full migration into typed source belongs to Phase 4 scope discussion.

## B. Personal routing — verify first, then fix

The June fixes were never verified. On the dev stack (Neon dev branch + local web +
unpacked extension) run the four checks from HANDOFF-NEXT §"NOT verified":
1. Personal stays selected through the first answer on a fresh chat
   (`isFreshChatKeyUpgrade` in `pickPreferredProjectId`).
2. Auto-capture into deliberately-selected Personal saves.
3. Multi-project "also save to" chevron end-to-end (session links AND merged digests;
   drain running, budget untapped).
4. MCP `"personal"` alias fetch + save round-trip.

Then fix what's broken. Known gaps to close regardless:
- MCP direct `add_memory projectId:"personal"` writes bare notes — no Folk
  categorization, no About-you regen. Route through the same personal-write path as
  capture/web (`writePersonalFacts` tail triggers regen; budget-gated).
- Tune personal harvest salience threshold ONLY if dev testing shows noise (sample
  `memory.personal_fact_skipped` logs first).

## C. Auth fallback instrumentation

- Google callback has four layered session-establishment fallbacks
  (`apps/web/src/app/api/integrations/google/callback/route.ts:141-163`) with logs but
  no PostHog events. Emit per-fallback usage counters so we can quantify how many
  sign-ins ride the last-resort manual path.
- Deduplicate later (Phase 4); this phase only instruments + adds unit tests for
  `google-auth-service` fallback ordering (behavior-contract style, see Phase 3 rules).

## Acceptance criteria

- [ ] Repro script: chip dismissed → send first message → chip STAYS hidden; ⌘⇧I still
      summons; reload keeps it hidden within TTL; new chat shows again
- [ ] Four verification checks recorded here with pass/fail + evidence
- [ ] Whatever failed is fixed with focused tests
- [ ] Fallback telemetry visible in PostHog (event names documented)
- [ ] typecheck + `pnpm test:stable` green; extension prod build clean

## Outcome

_(fill after execution)_
