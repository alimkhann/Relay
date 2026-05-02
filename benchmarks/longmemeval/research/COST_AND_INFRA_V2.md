# Relay cost and infra notes v2

Date: 2026-04-13

This version updates `COST_AND_INFRA.md` after the architecture changes implemented in Phases 1-5:
- typed canon + summaries
- current vs historical retrieval
- observer/reflector foundation
- packet specialization for browser chats vs coding agents
- Free / Starter / Pro plan foundation
- `basic` vs `deep` read metering

This note is intentionally conservative. It assumes some free users abuse the product, some paid users underuse it, and conversion is not magical.

## 1. What changed economically

The old cost model assumed too many MCP reads triggered full synthesis. That made free users dangerous and implied very high Pro pricing.

The current architecture is better:
- many reads can now stay `basic`
- only some reads need to be `deep`
- browser packets are smaller than agent packets
- Starter and Pro can route to different model paths

That does **not** mean free is safe by default.

Free can still hurt if you allow:
- too many deep reads
- too many autonomous updates
- long retention
- too many projects

So the right policy is still:
- let free users understand value quickly
- do not let them camp on the free tier forever

## 2. Pricing stance

Current recommended pricing remains:
- `Free`
- `Starter $12/mo`
- `Pro $18/mo`

Recommended annual pricing:
- `Starter annual: $122/year` (`~15%` discount, effective `~$10.17/mo`)
- `Pro annual: $184/year` (`~15%` discount, effective `~$15.33/mo`)

Why not deeper annual discounts:
- you do not have margin to subsidize large discounts yet
- this is a complement to other AI tooling, so price sensitivity is real
- `15%` annual discount is enough to encourage commitment without damaging unit economics

Recommended annual share assumption for planning:
- `10-20%` of paid users on annual
- baseline planning assumption: `15%`

## 3. Updated unit-cost model

### AI assumptions

Using the same Gemini pricing family and conservative operational assumptions:
- embeddings remain cheap and are not the primary cost center
- analyses are still cheap compared to read-time synthesis
- `deep` reads dominate AI cost
- `basic` reads should mostly hit deterministic retrieval and cached state

Conservative average per-operation assumptions:
- capture embedding: `~$0.00003`
- digest/analysis unit: `~$0.0012`
- Starter deep read: `~$0.0045`
- Pro deep read: `~$0.0070`
- basic read AI cost: `~$0.0000` to `~$0.0003` in practice; treat as infra, not model spend

Those are not benchmark-only numbers. They include a realistic amount of overhead for richer packet generation, retries, and slightly larger packets than early Relay.

### What this means

- AI cost is now much more controllable than in the original model.
- The main risk is no longer “every read costs Flash.”
- The main risk becomes “free users consume too many deep reads and writes.”

## 4. Recommended launch limits

These are business recommendations, not necessarily identical to the current code defaults.

### Free

Goal: prove value in a few days, not provide a permanent free workflow.

Recommended launch free limits:
- `2` active projects
- `7 days` retention
- `100` captures/month
- `60` basic reads/month
- `8` deep reads/month
- `15` MCP writes/day is too high for free; better target `10-20/month` or `1-2/day`
- `20` AI analyses/month
- `150` memory items total or a similarly strict cap
- autonomous summaries: yes, limited
- autonomous canon upkeep: minimal / low-risk only
- no generous handoff/export pack usage

This makes free useful for:
- installing
- trying capture
- trying one or two insertions
- seeing that Relay actually understands project continuity

But it prevents free from becoming a subsidized always-on tool.

### Starter $12

Recommended shape:
- `8-10` active projects
- `180 days` retention
- `1000-1200` captures/month
- `1500-2500` basic reads/month
- `120-180` deep reads/month
- `75-100` writes/month
- `80-120` analyses/month
- standard paid autonomy
- standard synthesis quality

### Pro $18

Recommended shape:
- `15-20` active projects
- `365 days` retention
- `2000-2500` captures/month
- `4000+` basic reads/month
- `300-450` deep reads/month
- `150-200` writes/month
- `160-220` analyses/month
- better model path
- faster/more frequent reflection
- stronger canon upkeep

## 5. Conservative monthly cost per active user

These are average active-user estimates, not worst-case maxing.

### Free active user

Assumed monthly usage:
- `40` captures
- `12` basic reads
- `2` deep reads
- `4` analyses

Estimated AI cost:
- captures: `40 * 0.00003 = $0.0012`
- deep reads: `2 * 0.0045 = $0.0090`
- analyses: `4 * 0.0012 = $0.0048`
- AI subtotal: `~$0.02`

Add infra allocation and overhead:
- realistic total: `~$0.08-$0.20/free MAU`

Interpretation:
- free can be safe **if** deep reads stay hard-capped and retention stays short
- free becomes dangerous again if you loosen deep reads or let MCP writes explode

### Starter active user

Assumed monthly usage:
- `180` captures
- `120` basic reads
- `25` deep reads
- `20` analyses

Estimated AI cost:
- captures: `~$0.005`
- deep reads: `25 * 0.0045 = ~$0.11`
- analyses: `20 * 0.0012 = ~$0.02`
- AI subtotal: `~$0.14`

Add infra + retries + overhead:
- realistic total: `~$0.60-$1.50/starter MAU`

### Pro active user

Assumed monthly usage:
- `350` captures
- `250` basic reads
- `60` deep reads
- `45` analyses

Estimated AI cost:
- captures: `~$0.01`
- deep reads: `60 * 0.0070 = ~$0.42`
- analyses: `45 * 0.0012 = ~$0.05`
- AI subtotal: `~$0.48`

Add infra + retries + richer packet generation + more autonomy:
- realistic total: `~$1.50-$3.50/pro MAU`

### Important reality check

These are **average** active-user numbers under the new architecture.

Worst-case users can still be much more expensive.
That is why:
- deep reads must stay bounded
- free retention must stay short
- plan-aware routing must stay strict

## 6. Conversion assumptions

Do not plan around heroic conversion.

Reasonable early SaaS/devtool assumptions:
- low case paid conversion: `2%`
- baseline paid conversion: `3.5%`
- strong case paid conversion: `5%`

Paid mix assumption:
- `75% Starter`
- `25% Pro`

Annual share assumption:
- `15%` of paid users choose annual

WAU/MAU assumption:
- baseline `40%`

This is directionally realistic for a sticky utility product, but still not guaranteed.

## 7. Revenue model by user count

Weighted paid ARPU with the assumptions above:
- Starter effective monthly ARPU: `~$11.73`
- Pro effective monthly ARPU: `~$17.60`
- weighted paid ARPU at `75/25`: `~$13.20`

### Baseline case: 3.5% paid conversion

| MAU | WAU | Paid users | Starter | Pro | Annual paid | Est. MRR |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 200 | 80 | 7 | 5 | 2 | 1 | ~$92 |
| 500 | 200 | 18 | 14 | 4 | 3 | ~$238 |
| 1000 | 400 | 35 | 26 | 9 | 5 | ~$462 |
| 2000 | 800 | 70 | 53 | 17 | 11 | ~$924 |
| 5000 | 2000 | 175 | 131 | 44 | 26 | ~$2,310 |
| 10000 | 4000 | 350 | 263 | 87 | 53 | ~$4,620 |

### Low case: 2% paid conversion

| MAU | Paid users | Est. MRR |
| --- | ---: | ---: |
| 200 | 4 | ~$53 |
| 500 | 10 | ~$132 |
| 1000 | 20 | ~$264 |
| 2000 | 40 | ~$528 |
| 5000 | 100 | ~$1,320 |
| 10000 | 200 | ~$2,640 |

### Strong case: 5% paid conversion

| MAU | Paid users | Est. MRR |
| --- | ---: | ---: |
| 200 | 10 | ~$132 |
| 500 | 25 | ~$330 |
| 1000 | 50 | ~$660 |
| 2000 | 100 | ~$1,320 |
| 5000 | 250 | ~$3,300 |
| 10000 | 500 | ~$6,600 |

## 8. Infra and blended cost by scale

Assume a Vercel Pro + Neon Launch default stack early on.

Conservative monthly infra ranges excluding AI:

| MAU | Vercel-ish app layer | Neon | Other overhead | Total infra |
| --- | ---: | ---: | ---: | ---: |
| 200 | $20-$25 | $0-$5 | $5-$10 | ~$25-$40 |
| 500 | $20-$35 | $5-$10 | $10-$15 | ~$35-$60 |
| 1000 | $25-$50 | $10-$20 | $15-$25 | ~$50-$95 |
| 2000 | $35-$75 | $15-$30 | $20-$35 | ~$70-$140 |
| 5000 | $60-$140 | $30-$60 | $35-$60 | ~$125-$260 |
| 10000 | $100-$240 | $50-$100 | $50-$100 | ~$200-$440 |

These are still modest relative to payroll.
Your real risk is bad free-tier AI economics, not database storage.

## 9. Blended margin sanity check

Using the baseline `3.5%` conversion case and conservative average-user cost assumptions:

### 1000 MAU example

Users:
- `965 free`
- `26 starter`
- `9 pro`

Estimated monthly operating cost:
- free cohort: `965 * $0.08-$0.20 = ~$77-$193`
- starter cohort: `26 * $0.60-$1.50 = ~$16-$39`
- pro cohort: `9 * $1.50-$3.50 = ~$14-$32`
- infra: `~$50-$95`

Total estimated monthly cost:
- `~$157-$359`

Estimated MRR:
- `~$462`

Interpretation:
- at 1000 MAU and 3.5% paid conversion, this is potentially viable
- but only if free is tight and deep reads stay bounded
- if free is loose, the economics deteriorate fast

### 5000 MAU example

Estimated MRR:
- `~$2,310`

Estimated monthly cost:
- free: `~$385-$965`
- starter: `~$79-$197`
- pro: `~$66-$154`
- infra: `~$125-$260`
- total: `~$655-$1,576`

Interpretation:
- at this point the product can support itself much more comfortably
- but conversion and abuse control still matter more than infra optimization

## 10. What should change in limits, realistically

### Recommended final stance

You are right not to want a charity product.

Free should be:
- enough to understand the value
- not enough to live in forever

So I would recommend you tighten free further before broad launch, even if the code currently allows more.

### Best practical free tier

- `2` projects
- `7 days` retention
- `100` captures/month
- `60` basic reads/month
- `8` deep reads/month
- `10-20` writes/month total
- `20` analyses/month
- limited autonomous summaries
- no full “export/handoff as a habit” usage pattern

This is a trial-shaped free tier without needing a timebombed signup trial.

### Starter should remain usable

Do not cripple Starter too hard.
It is your real solo paid product.

Recommended Starter shape:
- keep current price `12`
- keep standard autonomy on
- keep enough deep reads for daily usage
- keep model quality clearly good, but not premium-best

### Pro should justify itself on quality

Pro should win on:
- better packet quality
- stronger reflection cadence
- better model path
- more robust project-state upkeep

Not just higher caps.

## 11. Annual plans and promos

Recommended annual share assumption in planning:
- `15%` of paid users

Recommended annual discount:
- `15%`

Recommended promo policy:
- public launch: `10-15%`
- founding users: `20%` for `6-12 months`
- private tester/friends: `25-30%` max, time-limited
- avoid permanent deep discounts

## 12. Final recommendations

1. Keep prices at `Starter $12` and `Pro $18` for now.
2. Tighten free more than the current implementation if you want safety.
3. Treat `basic` vs `deep` reads as the core economic control lever.
4. Do not assume more than `3.5%` paid conversion in planning.
5. Use annual plans sparingly and with only a modest discount.
6. Keep Vercel + Neon as the default stack until usage patterns prove you need always-on containers.

## 13. Benchmark iteration cost note

Recent Oracle runs showed an important practical lesson:
- `gpt-4o-mini` is the right low-cost benchmark iteration model for Relay right now
- it produced a better Oracle score than the latest `gpt-4o` run in the current harness, while being dramatically cheaper

Observed benchmark costs in the current harness family:
- full Oracle with `gpt-4o`: about `$4.63` answer-generation cost in the latest completed full run, plus judge cost
- full Oracle with `gpt-4o-mini`: about `$0.35` answer-generation cost for the split focus+rest runs combined, plus judge cost
- tiny real samples stay in the low-cent range and should always be used before any full rerun

Recommended benchmark iteration policy:
- use `gpt-4o-mini` for tiny samples and focused subsets
- only use `gpt-4o` occasionally as a comparison/sanity model
- never spend full-Oracle money repeatedly without first validating on a tiny sample

This does not directly change product pricing, but it materially improves engineering iteration economics.

## Sources used for updated infra notes

- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Vercel pricing: https://vercel.com/pricing
- Neon pricing: https://neon.com/pricing
- Railway pricing: https://railway.com/pricing
- Fly.io pricing: https://fly.io/docs/about/pricing/
- Render pricing: https://render.com/pricing
- Coolify pricing: https://coolify.io/pricing
