# Relay cost and infra notes

Date: 2026-04-12

## Scope

This note answers section H of `benchmarks/longmemeval/RETRIEVAL_IMPROVEMENT_RESEARCH.md` with rough but explicit unit-economics math.

Important:
- All numbers are estimates, not guarantees.
- Gemini prices are from Google's official Gemini Developer API pricing page.
- Vercel, Railway, Neon, Fly.io, Render, Coolify, and Hetzner numbers are from official pricing pages where possible.
- OpenAI embedding pricing could not be freshly verified from an official page during this run because the current pricing page was partially blocked/challenge-gated; I note that as unknown instead of inventing a number.

## 1) Assumptions used for the math

### Product assumptions

- Mix for break-even scenario: `1000 total users`, `5% pro`, `95% free`.
- "Average user" means `30% of current product limits`, per the request.
- Free limits: `200 captures/mo`, `18 AI analyses/day`, `20 MCP reads/day`.
- Pro limits: `2000 captures/mo`, `120 AI analyses/day`, `200 MCP reads/day`.

### AI call assumptions

Prices used:
- Gemini embedding (`gemini-embedding-001`): `$0.15 / 1M input tokens`, batch `$0.075 / 1M`. Source: https://ai.google.dev/gemini-api/docs/pricing
- Gemini 3.1 Flash-Lite Preview: `$0.25 / 1M input`, `$1.50 / 1M output`; batch `$0.125 / 1M input`, `$0.75 / 1M output`. Source: https://ai.google.dev/gemini-api/docs/pricing
- Gemini 3 Flash Preview: `$0.50 / 1M input`, `$3.00 / 1M output`; batch `$0.25 / 1M input`, `$1.50 / 1M output`. Source: https://ai.google.dev/gemini-api/docs/pricing

Modeled token sizes:
- Capture embedding: `150 tokens` average per memory item.
- Query embedding on MCP read: `40 tokens` average.
- Digest/adjudication "analysis" unit, realistic average: `2000 input + 400 output` on Flash-Lite.
- Digest worst-case ceiling: `6000 input + 1200 output` on Flash-Lite.
- Bootstrap/context assembly, realistic average: `4000 input + 600 output` on Flash.
- Bootstrap worst-case ceiling: `14000 input + 2000 output` on Flash.

Per-call costs from those assumptions:
- Capture embedding: `150 * 0.15 / 1,000,000 = $0.0000225`
- Query embedding: `40 * 0.15 / 1,000,000 = $0.000006`
- Analysis realistic average: `(2000 * 0.25 + 400 * 1.50) / 1,000,000 = $0.00110`
- Analysis worst-case: `(6000 * 0.25 + 1200 * 1.50) / 1,000,000 = $0.00330`
- Bootstrap realistic average: `(4000 * 0.50 + 600 * 3.00) / 1,000,000 = $0.00380`
- Bootstrap worst-case: `(14000 * 0.50 + 2000 * 3.00) / 1,000,000 = $0.01300`

Interpretation:
- Embeddings are cheap.
- Read-side bootstrap/synthesis is the dominant AI cost if every MCP read triggers a full model call.

## 2) Per-user monthly AI cost

### Free user

Worst-case at current limits:
- Captures: `200 * $0.0000225 = $0.00`
- Analyses: `540 * $0.00330 = $1.78`
- Reads: `600 * ($0.01300 + $0.000006) = $7.80`
- Total: `~$9.58/user/month`

Average user at 30% of limits:
- Captures: `60 * $0.0000225 = $0.00`
- Analyses: `162 * $0.00110 = $0.18`
- Reads: `180 * ($0.00380 + $0.000006) = $0.69`
- Total: `~$0.86/user/month`

### Pro user

Worst-case at current limits:
- Captures: `2000 * $0.0000225 = $0.05`
- Analyses: `3600 * $0.00330 = $11.88`
- Reads: `6000 * ($0.01300 + $0.000006) = $78.04`
- Total: `~$89.97/user/month`

Average user at 30% of limits:
- Captures: `600 * $0.0000225 = $0.01`
- Analyses: `1080 * $0.00110 = $1.19`
- Reads: `1800 * ($0.00380 + $0.000006) = $6.85`
- Total: `~$8.05/user/month`

### Takeaway

- Your current free tier is only safe if actual read-side synthesis volume stays far below the cap, or if many reads are cached/deterministic.
- A maxed-out free user is potentially a `~$10/mo` AI customer with `$0` revenue.
- A maxed-out pro user is not economically viable at ordinary SaaS pricing if every read invokes Flash.

## 3) Break-even at 1000 users, 5% pro

### AI-only math

Using the 30%-of-limits average model:
- Free cohort AI cost: `950 * $0.86 = ~$817/mo`
- Pro cohort AI cost: `50 * $8.05 = ~$403/mo`
- Total AI cost: `~$1,220/mo`

Required pro ARPU to cover AI only:
- `$1,220 / 50 pro users = $24.40`

### Add app infra + Neon

Reasonable app + DB budget at 1000 users:
- App hosting: `~$20-$80/mo` depending on platform
- Neon: `~$10-$40/mo` at this scale if bursty and scale-to-zero stays on
- Practical operating target: `~$80-$150/mo` non-AI infra

Required pro ARPU including infra:
- `($1,220 + $80 to $150) / 50 = ~$26.00 to ~$27.40`

### Recommendation

- Recommended pro price: `~$29/mo`
- If you keep the current free tier shape, `~$19/mo` looks too thin at only `5%` pro conversion.
- If you want a `~$19/mo` pro price, you probably need one or more of:
  - fewer free AI reads/analyses,
  - more deterministic read responses,
  - aggressive caching of briefs/bootstrap output,
  - higher pro conversion than `5%`.

### Worst-case warning

If all 950 free users actually max the current caps, free AI cost alone is:
- `950 * $9.58 = ~$9,101/mo`

That is enough to make the current free tier dangerous even before infra.

## 4) Infrastructure comparison (app layer only; Neon separate)

### Shared workload assumptions for comparison

For `1000 users`, using the 30%-of-limits average model and 5% pro mix:
- Captures: `~87,000/mo`
- Analyses: `~207,900/mo`
- MCP reads: `~261,000/mo`
- App/API invocations budgeted: `~550k-650k/mo` plus normal page traffic

Scaling that linearly:
- `5000 users`: `~2.8M-3.2M` invocations/mo
- `10000 users`: `~5.5M-6.5M` invocations/mo

These are rough enough for infra planning, not billing reconciliation.

### Vercel Hobby

Official notes:
- Hobby is free and currently includes `1M` function invocations, `4-5 active CPU hours`, `360 GB-hours memory`, `100 GB` fast data transfer, and `1M` edge requests. Source: https://vercel.com/pricing

Estimate:
- `1000 users`: maybe `technically possible` on request count, but active CPU and commercial-use constraints make it a poor production choice.
- `5000 users`: likely over Hobby limits.
- `10000 users`: not realistic.

Recommendation:
- Treat Hobby as dev-only for Relay.
- Main blocker is not only usage; Hobby is not the right plan for a commercial SaaS.

### Vercel Pro

Official notes:
- `~$20/user/month`, includes `$20` usage credit, then usage-based overages. Active CPU starts at `$0.128/hour`, provisioned memory at `$0.0106/GB-hour`, invocations at `$0.60/1M`, bandwidth starts at `$0.15/GB` after included allotments. Source: https://vercel.com/pricing

Rough app-layer estimate:
- `1000 users`: `~$20-$40/mo`
- `5000 users`: `~$35-$90/mo`
- `10000 users`: `~$60-$170/mo`

Why the range:
- Very cache-friendly Next.js apps can stay cheap.
- Long-lived MCP/API handlers push active CPU higher.

Recommendation:
- Best low-ops default if you stay on Next.js and keep most traffic short-lived.
- Risk: cold starts and long-running streaming/agent flows are still not as natural as container platforms.

### Railway Hobby / Pro

Official notes:
- Hobby has a `$5` minimum usage commitment; Pro has `$20`. Resource pricing is `$0.00000772/vCPU/sec`, `$0.00000386/GB/sec`, and `$0.05/GB` egress. Source: https://railway.com/pricing

Always-on container estimate:
- `1 vCPU + 1 GB RAM` running all month is about `~$30/mo` before egress.
- `2 vCPU + 4 GB RAM` is about `~$120/mo` before egress.

Rough app-layer estimate:
- `1000 users`: `~$35-$55/mo`
- `5000 users`: `~$90-$150/mo`
- `10000 users`: `~$180-$300/mo`

Hobby vs Pro:
- For a solo founder, Hobby is usually enough operationally.
- Pro mainly buys team/log retention/support, not a radically cheaper runtime.

Recommendation:
- Strong option if MCP/WebSocket-ish or always-on background behavior becomes central.
- More predictable than serverless; a bit pricier than Vercel at low scale.

### Hetzner VPS (CPX22-ish) + Cloudflare

Official notes:
- Hetzner regular-performance cloud exposes CPX22 class specs (`2 vCPU`, `4 GB RAM`, `80 GB SSD`) and hourly/monthly caps, but the public page renders price values through JS components that were not fully retrievable in this session. Source page: https://www.hetzner.com/cloud/regular-performance
- Your prompt's own anchor (`~EUR4-8/mo for CX22-ish`) is directionally right for the very low end of Hetzner cloud pricing.

Rough app-layer estimate:
- `1000 users`: `~$10-$25/mo`
- `5000 users`: `~$20-$45/mo`
- `10000 users`: `~$35-$80/mo`

Those ranges assume:
- one small box at the low end,
- one larger box or two small boxes by `10k` users,
- Cloudflare free in front,
- Neon still used for DB.

Recommendation:
- Cheapest raw compute.
- Not recommended as the first production target if the founder is explicitly "terrible at devops".
- Savings versus Vercel/Railway are real, but one bad outage can erase the difference.

### Coolify on Hetzner

Official notes:
- Self-hosted Coolify is free; Coolify Cloud starts at `$5/mo` plus `$3/mo` per extra connected server, but you still bring your own servers. Source: https://coolify.io/pricing

Rough app-layer estimate:
- Add `~$0-$8/mo` on top of the Hetzner numbers depending on self-hosted vs cloud dashboard.
- `1000 users`: `~$10-$30/mo`
- `5000 users`: `~$20-$50/mo`
- `10000 users`: `~$35-$90/mo`

Recommendation:
- Best "cheap but less painful than raw Docker" option.
- Worth considering only after the product has enough usage to justify extra ops complexity.

### Fly.io

Official notes:
- Usage-based only; examples on the pricing doc show shared-cpu instances from roughly `$3-$26/mo` depending on size, plus egress from `$0.02/GB` in NA/EU. Source: https://fly.io/docs/about/pricing/

Rough app-layer estimate:
- `1000 users`: `~$10-$25/mo`
- `5000 users`: `~$20-$45/mo`
- `10000 users`: `~$35-$70/mo`

Recommendation:
- Attractive if you want always-on, low-latency app servers without full VPS management.
- Better fit than Vercel for persistent connections and regional app placement.
- Higher platform complexity than Vercel/Railway.

### Render

Official notes:
- Workspace plans are `$0` hobby / `$19 per user` professional, and web services start at `$7/mo` (Starter) or `$25/mo` (Standard). Source: https://render.com/pricing

Rough app-layer estimate:
- `1000 users`: `~$26-$45/mo`
- `5000 users`: `~$45-$110/mo`
- `10000 users`: `~$100-$220/mo`

Recommendation:
- Simpler than Fly and less Vercel-specific than Vercel.
- Usually ends up more expensive than Hetzner/Fly for the same always-on footprint.

### SST / OpenNext on AWS

Notes:
- There is no simple fixed official monthly number because cost is pass-through AWS usage.
- It can be very cheap if caching is excellent and the team knows AWS well.
- It can also become more complex than any other option in this list.

Recommendation:
- Relevant later, not my default recommendation for a bootstrapped solo founder today.

## 5) Neon database cost and scaling notes

Official pricing:
- Launch compute: `$0.106/CU-hour`
- Storage: `$0.35/GB-month`
- Public egress: `100 GB included`, then `$0.10/GB`
- Scale-to-zero available after `5 minutes` on Launch. Source: https://neon.com/pricing and https://neon.com/docs/introduction/plans.md

### Storage model

Assume effective stored size per memory item of `~6-10 KB` once you include:
- raw text,
- metadata/json,
- `tsvector`,
- 768-dim vector,
- indexes/overhead.

That implies:
- `100 items/user` -> `~0.6-1.0 MB/user`
- `500 items/user` -> `~3-5 MB/user`

Estimated total storage:
- `1000 users`: `~0.6-5 GB`
- `5000 users`: `~3-25 GB`
- `10000 users`: `~6-50 GB`

Estimated storage cost:
- `1000 users`: `~$0.21-$1.75/mo`
- `5000 users`: `~$1.05-$8.75/mo`
- `10000 users`: `~$2.10-$17.50/mo`

Storage is not the scary part.

### Compute model

More important than storage:
- `1 CU` left on all month would cost about `24 * 30 * 0.106 = ~$76/mo`.
- But Launch can scale to zero, so bursty SaaS workloads often land far lower.

Practical rough estimate for Relay-style usage:
- `1000 users`: `~$5-$20/mo`
- `5000 users`: `~$15-$50/mo`
- `10000 users`: `~$30-$100/mo`

### Query-shape notes

- RLS itself is not the main cost risk if viewer/project predicates are indexed.
- pgvector cost becomes meaningful if you scan too many rows before filtering.
- Keep retrieval constrained by project/user first, then vector similarity.
- 768-dim vectors are fine for this scale; watch index choice and candidate counts before increasing dims.

### Should you move Postgres off Neon to Hetzner?

Not yet.

Why:
- Neon gives branching, managed backups, connection pooling, and scale-to-zero.
- A small self-hosted Postgres may save tens of dollars, not hundreds, at current likely scale.
- For a devops-light founder, managed Postgres is usually worth the premium.

## 6) Embedding/model cost optimization

### Embeddings

- Gemini embeddings are cheap enough that they are not the main cost center at current Relay limits.
- The best first optimizations are operational, not model-swaps:
  - batch backfills with Gemini batch pricing,
  - dedupe exact-identical content before re-embedding,
  - avoid re-embedding unchanged items on every update,
  - cache normalized query embeddings for repeated MCP reads,
  - skip semantic embedding for ultra-short/low-information items and rely on lexical only.

Practical skip rules worth testing:
- `< 8-10 words` and no named entity/date -> lexical only
- URLs, boilerplate, or UI chrome -> do not embed
- exact duplicates -> reuse prior embedding

### Gemini vs OpenAI

- Verified Gemini price here: `$0.15 / 1M tokens` for text embeddings. Source: https://ai.google.dev/gemini-api/docs/pricing
- I could not freshly verify the current official OpenAI embedding price during this run because the pricing page was challenge-gated in some fetches; do not make a provider switch on stale assumptions.
- Recommendation: treat embeddings as a second-order optimization; your bigger win is reducing read-time generation.

### Local open-source embeddings

Reasonable candidates:
- `nomic-embed-text`
- `bge-small-en-v1.5`
- `bge-base-en-v1.5`
- `all-MiniLM-L6-v2` for the cheapest baseline

Recommendation:
- If you stay on managed/serverless infra, keep Gemini for now.
- If you move app infra to an always-on box later, local embeddings become more attractive because marginal cost is near zero.
- `nomic-embed-text` or BGE-small/base are the ones I would test first; MiniLM is cheap but usually the lowest ceiling.

## 7) AI-analysis cost optimization

### Biggest economic truth

- The expensive operation is not capture embedding.
- The expensive operation is read-time synthesis/brief assembly if every read hits Flash.

### High-value changes

1. Make most free-tier MCP reads deterministic or cached.
   - Retrieve snippets + stored summaries without a fresh LLM call unless confidence is low.
2. Keep Flash-Lite for free-tier analysis work.
   - Use full Flash only for pro or for explicit "generate a handoff/brief" actions.
3. Use batch pricing for non-interactive work.
   - Digests, backfills, nightly compressions, and project-level summaries are good batch candidates.
4. Add memoization at the read layer.
   - Cache a project brief for `N` minutes or until new writes land.
5. Push more work into deterministic code.
   - conflict candidate detection,
   - duplicate detection,
   - simple importance scoring,
   - recency/session weighting,
   - exact-match/date/name boosts.

## 8) Feature gating recommendations

### Recommended changes

- Free `MCP write`: tighten hard, or move behind paid after trial.
- Free retention: cut from `30 days` to `7-14 days`.
- Free AI analyses: cut from `18/day` to something like `3-5/day` or replace with a monthly pool.
- Free MCP reads: keep reads, but make only a subset fully synthesized; the rest should be deterministic retrieval packs.
- Add a free global memory cap across all projects, not only per-project caps.

### Suggested revised free tier

- Projects: `2`
- Retention: `7-14 days`
- Captures: keep around `100-200/mo`
- MCP reads: `5-10/day`, mostly deterministic/cached
- MCP writes: `0-2/day` or paid-only after onboarding period
- AI analyses: `60-100/mo total`, not `18/day`
- Memory cap: `150-200 total`, not just `100/project`

### Suggested pro tier

- Price: `~$29/mo`
- Full retention, handoff packs, full MCP write, and higher synthesized-read allowances
- Consider metering the heaviest AI features separately if usage becomes spiky

## 9) Bottom-line recommendations

- Keep `Neon + Vercel Pro` as the default lowest-ops stack unless persistent-connection behavior becomes central.
- If MCP workflows start needing more always-on behavior, `Railway Hobby/Pro` is the strongest pragmatic alternative.
- Do not optimize embeddings first; optimize read-time synthesis first.
- Recommend `~$29/mo` pro pricing under the requested `1000 users / 5% pro / 30%-of-limits average` scenario.
- Tighten the free tier soon; the current caps are too generous if users actually exercise AI reads heavily.

## Sources

- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Vercel pricing: https://vercel.com/pricing
- Railway pricing: https://railway.com/pricing
- Neon pricing: https://neon.com/pricing
- Neon plans docs: https://neon.com/docs/introduction/plans.md
- Fly.io pricing: https://fly.io/docs/about/pricing/
- Render pricing: https://render.com/pricing
- Coolify pricing: https://coolify.io/pricing
- Hetzner regular-performance cloud page: https://www.hetzner.com/cloud/regular-performance
