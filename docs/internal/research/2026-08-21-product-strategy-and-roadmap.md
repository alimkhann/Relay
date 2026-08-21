# Product Strategy — Conversion, Relevance Challenge & Feature Proposals (2026-08-21)

## Part 1 — Conversion funnel audit

### Funnel as it exists today

| Stage | What exists | Grade |
|---|---|---|
| Landing | Full marketing stack; two competing hero CTAs (Chrome badge + "Get Started"); PostHog copy A/B test live; social proof = Product Hunt/Peerlist badges only, zero testimonials | C+ |
| Signup | Google OAuth + email OTP; custom Google flow with 4-layer session fallback (fragile, see bug doc); no dedicated signup page; referral cookie → checkout | C |
| Activation | Rich onboarding: 8-step walkthrough modal, persona picker, auto-capture prompt, extension↔web handoff | B |
| Monetization | Free / Starter $8 / Pro $12 (+yearly); Stripe checkout via `/get-started?upgrade=true`; soft paywall panel; quota system with recent "telemetry noise" fixes | B− |
| Retention | Uninstall churn page `/goodbye` with reason taxonomy; welcome email; **no re-engagement emails, no digests, no lifecycle messaging** | D |
| Instrumentation | PostHog (EU) marketing + product events; landing experiment exposure; but per HANDOFF-NEXT.md: no activation milestones (first capture/recall/project), no limit-hit→upgrade events, no MCP-surface funnel | C− |

### Ranked conversion problems

1. **The funnel forks at click #1.** Hero sends users to the Chrome Web Store *before*
   account creation; the extension then demands a separate in-sidebar signup. Two funnels,
   attribution dies at the store, and the highest-intent moment (post-install) is spent on
   auth plumbing instead of value. Fix direction: account-first or extension-first — pick
   one. Given Google OAuth friction history, consider "install first, account later"
   (anonymous device identity → lazy upgrade), which also removes the OTP context-switch.
2. **No proof.** Zero testimonials/case numbers while selling a trust-heavy product
   ("we remember for you"). One real quote + one concrete stat beats any copy rewrite.
3. **Activation milestones unmeasured** — you cannot fix conversion you can't see.
   Ship `first_capture`, `first_recall`, `first_project`, `limit_hit`, `upgrade_viewed`
   before touching pricing (HANDOFF-NEXT already planned exactly this; it never shipped).
4. **Pricing page promises, product pages don't reinforce.** Pricing CTAs route through
   signup instead of straight to checkout for returning visitors.
5. **Retention is a cliff.** Nothing brings users back between week 1 and churn except
   habit. A weekly "what Relay remembered" digest email is cheap and doubles as the
   product's own demo.

## Part 2 — Is Relay still useful? (the honest challenge)

### The bear case
- Native memory shipped everywhere: ChatGPT memory + saved memories, Claude memory,
  Gemini Saved Info. The original pitch — "your AI forgets you" — is eroding at the
  consumer level every quarter.
- The capture mechanism is structurally fragile: DOM adapters per site, network-parser
  forks per vendor (`capture/network-parsers/*` — 7 vendors), ToS/platform risk. You
  already have a Chrome Web Store rejection sitting in the repo root as a souvenir.
- Consumer willingness to pay $8–12/mo for memory is thin when the incumbent bundles it free.
- Solo founder, 7 weeks dark, cutover frozen — the project is one more stall from compost.

### The bull case (what's actually durable)
- **Native memories are siloed.** ChatGPT doesn't know what you told Claude. Cross-AI
  portability is still unsolved by vendors (they have no incentive to solve it).
- **Agents are exploding and they have NO memory story.** Every MCP client, CLI agent,
  and coding harness starts each session amnesiac. Relay already ships an MCP server,
  hosted MCP stream, CLI, wizard, and agent memory taxonomy — that's further along than
  most dedicated "agent memory" startups.
- The repo's hardest-won assets are not the DOM adapters — they're the
  **memory pipeline**: Folk taxonomy, evidence graph, dedup/decay/scheduling, personal vs
  project routing, governance model. That's portable to surfaces that don't require
  scraping chat DOMs.

### Verdict
As a *consumer chat-memory sidecar*, Relay is a shrinking wedge with rising platform risk.
As an *agent memory layer*, it's early in a growing market and the codebase is already
60% there. The strategic error would be continuing to fund the weak product with effort
while the strong product starves.

## Part 3 — The big suggestion

**Reposition: Relay = the memory layer for your AI stack. Extension demotes from
"the product" to "one capture surface." MCP/hosted-API promotes to hero.**

Concretely:
1. **Lead with MCP.** Landing page hero becomes "Give every AI agent your context" with
   `npx @onrelay/wizard` as the primary CTA — developers convert through a terminal, not
   a Chrome store. The wizard already exists and is good.
2. **Ship `@onrelay/memory` SDK** (thin typed client over the hosted API): remember/query/
   forget. Distribution via npm + Smithery (already configured). This turns Relay from an
   app into infrastructure people import.
3. **Team memory (the revenue unlock).** Shared project memory with roles — the DB already
   has `project_members` and RLS designed for it. Teams feel memory pain harder than
   individuals and pay per seat without blinking. Price it $15–20/seat.
4. **Portability as marketing.** "Export everything, always" — full JSON/MD export +
   delete. It's the anti-vendor-lock-in stance no native memory can take, and it's nearly
   free to build given the data model.
5. Keep the extension alive but reframe its job: passive capture + recall injection for
   *chat* surfaces only. Stop investing in sidepanel parity features that serve the old story.

Sequencing note: this does NOT require abandoning memory-v2 — the pipeline work is the
foundation of the new story. But it does mean the frozen cutover decision (bug doc §3)
becomes even more urgent: you can't sell infrastructure on a schema you're afraid to migrate.

## Part 4 — Your two feature notes, developed

### 4a. MCP instruction tuning (recall-first)
Current guidance tells agents to start with `get_brief` every session. For returning
sessions on a known project this is often wasted round-trips — `recall` answers specific
questions cheaper and the brief regenerates anyway.
Proposal:
- Instructions: default to `recall` for targeted questions; use `get_brief` only at true
  session start, after absence (>~a week), or on ambiguity/wrong-project detection.
- Add a lightweight `brief_kind` hint: `quick_continuity` (cheap) vs full bootstrap —
  the enum already exists server-side; surface it in tool docs so agents self-select.
- Consider letting `recall` return a one-line staleness header ("context last updated Xd ago;
  consider get_brief") so agents can escalate themselves instead of following static rules.
This belongs in `packages/mcp/src` tool descriptions + hosted twin + AGENTS.md overlays,
in one change (they must not drift — see audit finding #3/#6).

### 4b. Shared ephemeral cross-surface memory ("scratchpad")
The need: working state that follows you across extension ↔ MCP ↔ web ↔ CLI agents
without polluting durable project memory, auto-expiring when done. No more copy-paste.

Design sketch:
- **Model:** a `scratchpad` scoped to user (or user+project), entries = {content, source
  surface, created_at, expires_at}. TTL default ~7 days, sliding on touch. Not a Folk
  category, not embedded by default (cost), excluded from digests/graphs.
- **Surfaces:** MCP tools `scratchpad_add` / `scratchpad_read` / `scratchpad_clear`;
  extension quick-note affordance in the sidepanel; dashboard widget; CLI one-liner.
  Agentic writes allowed (agents jot "currently debugging X"), manual pin-to-project
  promotes an entry into real memory when it proves durable.
- **Handoff moment:** when a new surface session starts and scratchpad is non-empty,
  `get_brief`/`recall` prepend "Unfinished elsewhere:" — that's the whole magic: switch
  from Claude Code to Cursor mid-task and the new session knows.
- **Deletion:** hard TTL purge in the existing cron drain; explicit clear; auto-clear on
  "task done" signal if an agent marks it.
- Cost guard: no embeddings until promoted; count against write quota at a discount.

This is small (one table, one repo, four thin surface hooks), high perceived value, and
it showcases exactly the cross-surface strength the repositioning sells.

### Other feature candidates (quick list)
- Weekly digest email ("what Relay learned about you this week") — retention + demo.
- Memory conflict resolution UI ("you told ChatGPT X but Claude Y — which is current?").
- Import native memories (ChatGPT/Claude export files) — instant aha on day 0, directly
  attacks the silo problem.
- Recall quality score / "why did I get this" trace view — trust builder for the graph
  work already built.

## Part 5 — On your prompt (as requested)

Your request was sprawling but salvageable — I ran it as three parallel investigations.
What would have made it 2× sharper next time:
1. Split bug-hunting from strategy. "Find why X breaks" and "tell me if my company should
   exist" want different sessions and different energy.
2. Give repro steps for the bugs ("xcross" took archaeology to decode — a screenshot or
   "the ✕ on the chip on chatgpt.com comes back after I send a message" would have cut
   an hour).
3. Define "conversion": signups? paid? activation? I assumed all three; data could say otherwise.
4. Grant data access (PostHog dashboards, Neon read replica) — opinions about conversion
   without funnel numbers are just vibes.
5. Say what success looks like ("I want to decide: kill, pivot, or push" vs "clean up tech debt").

Not bad rumbling — the instincts (conversion is broken, app relevance doubtful, something
huge missing) all checked out against the code.
