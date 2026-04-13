# Relay memory growth economics

Date: 2026-04-13

This note answers a practical question: as users accumulate more memory, does each call become more expensive, and are the current tiers still viable?

Short answer:
- storage growth is manageable
- raw embedding cost is small
- the real danger is retrieval/prompt bloat, not storage itself
- Relay stays viable only if retrieval stays narrow and most reads remain `basic`, not `deep`

## 1. The main economic truth

More memory items do **not** need to make every call proportionally more expensive.

Call cost grows badly only if:
- retrieval scans too much junk
- too many old items are pulled into candidate sets
- final context size grows with project size
- too many reads escalate to `deep`

Relay's newer architecture reduces that risk by using:
- canon entries
- summaries
- current vs historical filtering
- packet specialization by surface
- `basic` vs `deep` read routing

So the correct mental model is:

`memory volume can grow` while `final prompt size should stay relatively bounded`

## 2. Final plan limits

These are the recommended final limits now implemented in backend config.

### Free
- `2` active projects
- `7` day retention
- `100` captures/month
- `12` basic MCP reads/day
- `2` deep MCP reads/day
- `1` MCP write/day
- `2` AI analyses/project/day
- `4` AI analyses/user/day
- `150` memory items/project

### Starter - `$12/mo`
- `10` active projects
- `180` day retention
- `1200` captures/month
- `200` basic MCP reads/day
- `12` deep MCP reads/day
- `15` MCP writes/day
- `8` AI analyses/project/day
- `40` AI analyses/user/day
- `1500` memory items/project

### Pro - `$18/mo`
- `20` active projects
- `365` day retention
- `3000` captures/month
- `500` basic MCP reads/day
- `30` deep MCP reads/day
- `40` MCP writes/day
- `18` AI analyses/project/day
- `90` AI analyses/user/day
- `4000` memory items/project

## 3. Cost assumptions used below

Conservative average costs per operation:
- embedding a captured item: `~$0.00003`
- one analysis operation: `~$0.0012`
- one Starter deep read: `~$0.0045`
- one Pro deep read: `~$0.0070`
- one basic read: effectively near-zero model cost; treat mostly as DB/app infra cost

Storage assumption per memory item, including indexes/vector/overhead:
- `~6-10 KB` effective stored footprint

## 4. Example project sizes

### Tiny project - `100` memory items

Approx storage:
- `~0.6-1.0 MB`

Operational reality:
- retrieval stays fast
- even raw retrieval is still cheap
- deep reads are inexpensive if top-k is kept tight

### Small real project - `500` memory items

Approx storage:
- `~3-5 MB`

Operational reality:
- still cheap in storage terms
- raw retrieval quality starts mattering more
- summaries/canon begin paying off because they reduce prompt bloat

### Medium solo project - `1500` memory items

Approx storage:
- `~9-15 MB`

Operational reality:
- this is why Starter should cap at about this range per project
- storage is still not scary
- bad retrieval strategy becomes the real risk
- without canon/summaries, answer contexts start pulling too much noisy history

### Heavy project - `4000` memory items

Approx storage:
- `~24-40 MB`

Operational reality:
- still manageable for Postgres storage cost
- candidate retrieval quality matters a lot
- summary and canon layers are mandatory for good economics and answer quality
- this is a reasonable Pro ceiling for now

## 5. Example storage cost by project size

Using Neon-style storage at roughly `$0.35/GB-month`:

| memory items | estimated size | monthly storage cost |
| ---: | ---: | ---: |
| 100 | `0.6-1.0 MB` | effectively `$0.00` |
| 500 | `3-5 MB` | effectively `$0.00` |
| 1500 | `9-15 MB` | `~$0.003-$0.005` |
| 4000 | `24-40 MB` | `~$0.01-$0.02` |

Conclusion:
- storage is not the problem
- retrieval and deep-read usage are the problem

## 6. Example monthly user economics by project size

These examples assume users do not max every quota every day. They reflect more realistic active usage.

### Free user with one tiny project (`~100 items`)

Monthly behavior:
- `40` captures
- `12` basic reads
- `2` deep reads
- `4` analyses

Estimated monthly variable cost:
- embeddings: `~$0.001`
- deep reads: `~$0.009`
- analyses: `~$0.005`
- infra/db/app overhead allocation: `~$0.07-$0.18`
- total: `~$0.08-$0.20`

Conclusion:
- safe enough as a trial tier
- only if deep reads and writes stay tight

### Starter user with one medium project (`~1500 items`)

Monthly behavior:
- `180` captures
- `120` basic reads
- `25` deep reads
- `20` analyses

Estimated monthly variable cost:
- embeddings: `~$0.005`
- deep reads: `~$0.11`
- analyses: `~$0.02`
- retrieval/infra overhead: `~$0.45-$1.35`
- total: `~$0.60-$1.50`

Conclusion:
- very viable at `$12`
- provided most reads remain basic and deep reads do not balloon

### Pro user with one heavy project (`~4000 items`)

Monthly behavior:
- `350` captures
- `250` basic reads
- `60` deep reads
- `45` analyses

Estimated monthly variable cost:
- embeddings: `~$0.01`
- deep reads: `~$0.42`
- analyses: `~$0.05`
- retrieval/infra/autonomy overhead: `~$1.00-$3.00`
- total: `~$1.50-$3.50`

Conclusion:
- still viable at `$18`
- but only if Pro quality is meaningfully better and prompt sizes remain bounded

## 7. What becomes more expensive as memory grows

### What stays cheap
- storing the items
- embedding new items once

### What gets riskier
- broad hybrid retrieval over many rows
- pulling too many weak candidates into the final prompt
- repeated deep reads on very large projects
- historical/current conflict resolution when done with too much raw evidence instead of canon/summaries

## 8. Why the current architecture is viable

Relay is viable because it is no longer trying to solve everything with raw snippet retrieval.

The following features are what make long-term economics reasonable:
- canon entries shrink the amount of truth that needs to be rediscovered every time
- summaries compress session history
- historical/current filtering avoids wasting tokens on irrelevant state
- packet specialization keeps browser chat prompts smaller than agent prompts
- `basic` vs `deep` routing stops every read from becoming an LLM synthesis call

## 9. What would make it non-viable again

Any of these would hurt badly:
- widening free deep-read limits
- widening free retention too much
- allowing free users to accumulate large persistent projects forever
- making Starter/Pro deep reads effectively unlimited
- allowing final prompt size to scale with project size
- switching too many basic reads to model-generated deep reads

## 10. Final recommendation

Yes, this is viable with the current final limits.

Best practices to keep it viable:
1. keep Free tight and trial-shaped
2. keep most reads basic
3. keep deep reads bounded by plan
4. keep summary/canon retrieval ahead of raw retrieval as projects get bigger
5. keep prompt assembly bounded even when memory volume grows

If those rules hold, growing memory volume should improve quality more than it increases cost.
