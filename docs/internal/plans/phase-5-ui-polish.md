# Phase 5 — UI Polish (kill the slop)

Goal: a design-review pass over every user-facing surface, fixing what fails review.
No product changes, no new features — polish only.

## Setup

1. Install the Microsoft design-review skill globally:
   `npx skills add microsoft/agent-skills@frontend-design-review -g -y`
   (already-installed complements: `web-design-reviewer`, `ui-ux-pro-max`,
   `frontend-design`, `humanizer`.)
2. Run the app locally (web + extension dev build) and capture Playwright screenshots:
   landing (desktop+mobile), pricing, docs index, sign-in, dashboard overview/memory/
   graph, extension sidepanel (personal All + project view), inline chip on ChatGPT.

## Review passes

For each surface run the frontend-design-review skill (Mode 1: audit against quality
pillars: Frictionless / Quality Craft / Trustworthy) and log findings with severity.

Known suspects to verify explicitly:
- Hero A/B experiment flash/CLS (client default `"variant"` before flags load;
  `use-landing-copy-experiment.ts`) — fix with server-side assignment or skeleton.
- Two competing hero CTAs (Chrome badge vs Get Started) — visual hierarchy fix only
  (which one wins is a Phase 6/product question; flag it, don't decide it).
- Personal overview stats bar still shows project-shaped labels ("decisions · tasks ·
  constraints") — documented cosmetic bug from HANDOFF-NEXT.
- Extension panel density/typography consistency vs web dashboard.
- Dark-mode consistency across both surfaces (`use-resolved-theme` paths).

## Fix rules

- Fix slop at the source (tokens/CSS modules), not per-pixel hacks.
- Accessibility issues (contrast, focus states, aria) are P0 within this phase.
- Anything requiring product decisions gets logged in "Deferred decisions" below,
  not improvised.

## Acceptance criteria

- [ ] Screenshot set captured and referenced here
- [ ] Findings table: surface / issue / severity / fixed-or-deferred
- [ ] All P0/P1 findings fixed; deferred items listed with owner=user
- [ ] Before/after screenshots for each fixed surface
- [ ] typecheck + tests green

## Outcome

_(fill after execution)_
