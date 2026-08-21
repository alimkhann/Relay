# Phase 6 — Easy Product Wins (conversion part 1 ONLY)

Goal: the cheap, non-grand conversion fixes from
`docs/internal/research/2026-08-21-product-strategy-and-roadmap.md` §Part 1.
Explicitly EXCLUDES: repositioning, scratchpad, team memory, pricing changes,
funnel restructuring (account-first vs extension-first decision).

## Tasks

### A. Activation milestone events (measure before optimizing)
Emit to PostHog (EU) — names documented in one place (`packages/shared` constants):
- `first_capture` (first successful capture per profile)
- `first_recall` (first successful recall/injection)
- `first_project` (second project created — first is auto-personal)
- `limit_hit` (+ plan, limit type)
- `upgrade_viewed`, `checkout_started`
Server-side emission where possible (reliable), client only for UI moments.
Storage: `user_milestones` table already exists — check and reuse.

### B. Social proof section on landing
- Add a testimonials/social-proof component to the marketing page.
- If no real quotes exist yet: ship with Product Hunt/Peerlist badges consolidated +
  a concrete product stat if honestly available (e.g. memories captured). NO fabricated
  testimonials. Placeholder marked clearly for the user to fill.

### C. Pricing CTA directness
- Returning authenticated visitors clicking paid CTAs go straight to checkout
  (`/api/billing/checkout`) instead of `/get-started?upgrade=true` round-trip;
  logged-out users still land on sign-in with `intent=sign-up`.

### D. Weekly digest email (only if time remains in session)
- Reuse existing Resend integration + digest-service data: "what Relay remembered this
  week" for active users. Opt-out link required. If it balloons, defer — it's the only
  optional item here.

## Acceptance criteria

- [ ] Milestone events visible in PostHog live view after a manual test pass
- [ ] Landing shows social proof without fabrication
- [ ] Authenticated paid-CTR path hits checkout directly (Playwright check)
- [ ] No changes to pricing numbers, plans, or quota logic
- [ ] typecheck + tests green; marketing lint clean (incl. the pre-existing
      `no-img-element` error in hero-section.tsx — fix it while touching that file)

## Outcome

_(fill after execution)_
