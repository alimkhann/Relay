# Asynkor vs Relay quick check

Date: 2026-04-18

## TL;DR

Asynkor looks good at **edit-time coordination** for multiple coding agents. It is **not** a LongMemEval-style memory system, and its "memory" is closer to a lightweight shared project/team context layer than a retrieval benchmarked long-term memory engine.

It is similar to Relay in one important way: both want a shared source of truth across agent surfaces. But the center of gravity is different:

- **Asynkor**: prevent parallel-agent file collisions, coordinate handoffs, expose team context through MCP.
- **Relay**: keep project state truthful across browser + coding surfaces, reconcile digests into canon, and preserve durable context across sessions.

My take: Asynkor is worth studying, but mostly for **coordination primitives**, not for LongMemEval or memory ranking ideas.

## What Asynkor actually is

From the public repo/site on 2026-04-18:

- Website/repo pitch: "File leasing for AI agent teams. One MCP server. Any IDE. Zero merge conflicts."
- Core mechanism: agents call `asynkor_start`, acquire leases on file paths, and blocked agents wait with `asynkor_lease_wait`.
- Handoffs are first-class: parked work resumes via `handoff_id`.
- "Memory" exists, but it is mostly **team context**:
  - owner-curated long-term project context
  - short memory entries via `asynkor_remember`
  - rules, protected zones, recent completed work, follow-ups
- Storage is mostly Redis coordination state plus an HTTP-backed team context service.

Important caveat: the public repo is still early. On 2026-04-18 the GitHub page showed **31 stars, 2 forks, 4 commits, no releases**.

## Is the memory good?

Useful: yes.

Comparable to Relay or LongMemEval memory systems: not really.

Why:

- The Asynkor "brain" is mainly a **shared operational context feed** for active coding teams.
- It does not appear to expose a serious retrieval/reranking architecture, temporal recall system, or benchmark story.
- I found no public LongMemEval claim in the site/repo materials I checked.

So the memory is "good" if the job is:

- give every agent the same project instructions
- carry forward recent lessons and follow-ups
- make active work visible

It is not obviously "good" in the sense of:

- benchmarked longitudinal recall
- complex semantic/temporal memory retrieval
- truth adjudication across heterogeneous surfaces

## Similarity to Relay

### Real overlap

- MCP-native context surface
- cross-agent / cross-session continuity
- handoff mindset
- shared project/team memory
- conflict awareness

### Main difference

Asynkor prevents **file conflicts before they happen**. Relay mostly reconciles **project truth after context capture**.

That means:

- Asynkor is stronger on "who is editing what right now?"
- Relay is stronger on "what is true for this project across sessions/surfaces?"

## LongMemEval relevance

Asynkor does **not** look like a LongMemEval-native system.

Reason:

- its memory is tied to coordination and inherited team context
- the public architecture centers on leases, parked work, snapshots, and rules
- there is no public eval story showing long-horizon conversational recall

So if the question is "is Asynkor good on LongMemEval or directly comparable to Relay's benchmark work?" the answer is **no clear evidence**.

## Best Relay improvements to steal

### 1. Add explicit active-work claims before flush time

Relay collects `touchedFiles`, but only as part of checkpoint/flush state. It does **not** expose an edit-time claim/lease primitive today.

Relevant code:

- `packages/mcp/src/tools/register.ts`
- `packages/mcp/src/tools/save-context.ts`
- `packages/shared/src/schemas/work-session.ts`
- `apps/web/src/server/services/work-session-flush-service.ts`

Practical improvement:

- add a lightweight MCP tool like `start_work` / `claim_paths`
- allow agents to declare intended files early
- warn on overlap before two agents diverge

This is the cleanest high-ROI Asynkor idea for Relay.

### 2. Use touched files as a first-class truth/relevance signal

Relay already aggregates `touchedFiles` in MCP work sessions, but the flush path mainly converts summary/progress/decisions/constraints/tasks into digest state. File touch data is collected, yet it is not driving coordination or retrieval in the same way.

Relevant code:

- `packages/mcp/src/client.ts`
- `apps/web/src/server/services/work-session-service.ts`
- `apps/web/src/server/services/work-session-flush-service.ts`

Practical improvement:

- feed touched-file sets into conflict scoring
- surface recent active files in briefs/dashboard
- rank recent file-touched sessions higher when answering project-state questions

### 3. Add protected zones on top of Relay canon locks

Relay already has canon locking semantics in the schema, but Asynkor's `warn / confirm / block` protected zones are a better operator-facing coordination primitive.

Practical improvement:

- map critical files/areas to protected zones
- require stronger confirmation before agents overwrite canon-sensitive regions
- tie zone hits into project governance UI

## Bottom line

Asynkor is worth tracking because it is one of the few products explicitly addressing **multi-agent edit coordination over MCP**. That part is adjacent to Relay and legitimately interesting.

But its public "memory" story is not a reason to change Relay's benchmark direction. The useful takeaway is:

- copy the **coordination layer**
- not the **memory benchmark framing**

## Sources

- https://asynkor.com/
- https://github.com/asynkor/asynkor
- https://raw.githubusercontent.com/asynkor/asynkor/main/mcp/internal/mcpserver/tools.go
- https://raw.githubusercontent.com/asynkor/asynkor/main/mcp/internal/teamctx/store.go
- https://raw.githubusercontent.com/asynkor/asynkor/main/mcp/internal/lease/store.go
- https://raw.githubusercontent.com/asynkor/asynkor/main/mcp/internal/work/store.go
