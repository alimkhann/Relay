# LongMemEval retrieval synthesis for Relay

Date: 2026-04-12

This synthesis answers sections A-G from `benchmarks/longmemeval/RETRIEVAL_IMPROVEMENT_RESEARCH.md`. File-level evidence is in the per-repo notes in this directory.

## Executive takeaways

- The best-performing open systems are not winning with pure vector retrieval. They combine at least two of: write-time compression, fact/entity extraction, temporal reasoning, graph/entity expansion, and second-stage reranking.
- A knowledge graph is not strictly required to reach or exceed `85%` on LongMemEval-style tasks, but high-scoring systems do need something graph-like somewhere: canonical entities, fact links, contradiction tracking, or associative edges.
- Relay's largest gap is multi-session continuity. The clearest fixes are not "better embeddings"; they are:
  - entity/fact continuity across sessions
  - session/project summary nodes above raw turns
  - query decomposition for temporal and multi-hop questions
  - reranking or stronger answer-time context packing
- Architecture quality matters more than model upgrades alone. Mastra OM is the clearest evidence in this set.

## A. Retrieval architecture

### A1. Best pipeline shape for conversational memory

Best observed shape for Relay-like workloads:

1. Query understanding
   - detect entities, date ranges, and whether the question asks for current vs historical truth
2. First-stage retrieval
   - current Relay hybrid retrieval is a good base: lexical + vector + recency
   - extend with fact/entity channels and optional session/project summary channels
3. Candidate expansion
   - expand from entity/fact matches to supporting turns/summaries when needed
4. Second-stage reranking
   - cross-encoder or late-interaction rerank over top-30/50 candidates
5. Context assembly
   - mix stable summaries with cited raw evidence, not raw evidence alone

In short: `hybrid retrieval -> graph/entity/session expansion -> rerank -> structured context pack`.

Evidence:
- Graphiti and Hindsight both use graph + hybrid retrieval + reranking.
- OMEGA uses strong hybrid retrieval plus temporal logic and optional reranking.
- Mastra OM wins with aggressive write-time compression and prompt-stable context rather than a heavy retrieval stack.

### A2. Is a knowledge graph necessary for >=85%?

No, but graph-like structure is extremely helpful.

- Mastra OM reaches high scores without a visible Graphiti-style property graph as the main retrieval index.
- OMEGA reaches top scores with hybrid retrieval, temporal logic, and typed memory weighting in a local SQLite system.
- Hindsight and Graphiti show that graph/entity relations help most on cross-session linking, contradictions, and multi-hop questions.

Conclusion:
- A full Neo4j-style graph is not required.
- Relay likely needs a lightweight graph layer: canonical entities, fact links, and contradiction/update edges.

### A3. Best embedding model + dimension cost/quality tradeoff

Findings from codebases:
- Many strong systems use relatively cheap local embeddings:
  - `bge-small-en-v1.5` (OMEGA, Hindsight docs)
  - `all-MiniLM-L6-v2` (Emergence OSS baseline, MemPalace baseline, OMEGA fallback)
- LongMemEval official baselines use Stella and other retrievers, but benchmark wins are not primarily from larger embedding dimension alone.

Recommendation for Relay:
- Keep current 768d class embeddings for now.
- Do not upgrade dimension first; invest in retrieval architecture first.
- If switching providers later, compare:
  - Gemini current path
  - `bge-small-en-v1.5` / `nomic-embed-text` on an always-on box
- A 3072d switch is unlikely to buy as much as session summaries + query decomposition + reranking.

## B. Multi-session

### B1. How high-scoring systems link facts across sessions

Three patterns repeat:

1. Canonical entities
   - Graphiti resolves entities across episodes and appends supporting provenance.
   - Hindsight links facts through `Entity`, `UnitEntity`, and `MemoryLink`.
2. Consolidated observations / summaries
   - Mastra OM keeps active observations and reflected generations.
   - Hindsight consolidates raw facts into observations.
3. Session-aware metadata and temporal context
   - LongMemEval itself rewards time-aware retrieval.
   - OMEGA has explicit temporal channels and category-specific retrieval tuning.

Relay implication:
- Link sessions through canonical entities/facts and summary nodes, not only by shared embedding neighborhood.

### B2. Is session-level summarization necessary?

Not strictly necessary, but it is the clearest path to improving Relay's weakest category.

- RAPTOR shows multi-level summaries help when the query asks at a higher abstraction level than any single chunk.
- Mastra OM is effectively a session/thread compression system and is the strongest OSS result here.
- Graph-only systems help, but graph alone does not solve context-window packing.

Recommendation:
- Add session-level and project-level summaries.
- Retrieve them alongside raw turns rather than replacing turns with summaries.

### B3. What query decomposition strategies help?

Best-supported strategies:
- extract date range / "when" constraints (LongMemEval time-aware pruning, OMEGA temporal inference)
- extract canonical entities and aliases (Graphiti, Hindsight)
- split complex questions into:
  - target entity/person/project
  - target attribute/fact
  - target time slice (`now`, `before`, `after`, `during`)

Relay should add a cheap query-analysis pass for:
- named entities
- explicit dates / relative dates
- current vs historical state
- single-hop vs multi-hop intent

## C. Knowledge updates

### C1. How do Graphiti and Mem0 handle contradictions?

- Graphiti keeps both versions and closes old validity windows using `invalid_at` / `expired_at`.
- Mem0 lets an LLM decide `ADD`, `UPDATE`, `DELETE`, or `NONE`, which is flexible but less auditable.

### C2. Is Relay's `supersedes` relation the right model?

Partly, but not by itself.

Best pattern from the set:
- keep the old fact
- mark the new fact as current
- preserve explicit temporal validity
- preserve provenance to the source turn/session

Recommendation:
- Keep `supersedes`, but add valid-time fields or a fact history table.

### C3. How do systems retrieve old state when asked?

Best answer in this set is Graphiti-style valid-time retrieval.

- Systems need to distinguish:
  - current state
  - state at time `t`
  - previous/overwritten state
- Relay currently has the supersession concept but not a complete "as-of" retrieval model.

Recommendation:
- Add query-time historical filters like `at`, `before`, `after`, `between`.

## D. Prompt engineering

### D1. What prompts are high-signal?

- LongMemEval official harness shows Chain-of-Note plus JSON-style reading prompts are strong.
- Mastra OM's prompts are high-signal because they separate:
  - observation extraction
  - reflection/compression
  - answer-time memory usage
- Backboard proves prompt packaging and history stuffing can materially affect score.

Relay implication:
- Answer prompt should explicitly instruct:
  - use current facts unless question asks historically
  - cite contradictions/uncertainty when needed
  - abstain when evidence is insufficient

### D2. Do systems use chain-of-thought?

- LongMemEval paper and related systems show structured intermediate reasoning helps.
- Emergence public writeups mention CoT-like reasoning.
- Most repos do not expose hidden reasoning verbatim, but many use multi-step prompting.

Recommendation:
- Use structured intermediate outputs for retrieval/context assembly, but avoid relying on opaque CoT in production prompts.

### D3. Optimal abstention strategy

- LongMemEval explicitly evaluates abstention.
- Best strategy is not aggressive answering; it is calibrated abstention when evidence is weak or contradictory.

Relay should abstain when:
- top evidence is low-confidence and weakly overlapping
- no evidence survives current/historical filtering
- retrieved results conflict and no valid-time distinction resolves the conflict

## E. Compression and scaling

### E1. How Mastra OM's compression works

- Observer creates dense observations from raw interaction blocks.
- Reflector periodically rewrites active observations into a smaller generation.
- Compression is achieved by staged task-oriented summarization and stable prompt injection, not by a special codec.

### E2. Letta archival eviction policy

- Letta's standard path is weaker than its conceptual model suggests.
- Overflow is often summarized back into context, not automatically promoted to archival retrieval.
- Voice sleeptime is the more interesting path: evicted transcript chunks get compressed into retrievable memory.

### E3. Middle ground for Relay

Best middle ground:
- keep raw turns
- add fact rows for updateable statements
- add session summaries and project summaries
- do not aggressively delete raw evidence

This is the most defensible compromise between Relay today and Mastra-style aggressive compression.

### E4. When do top systems compress?

- Mastra: at ingest / near-ingest time.
- Hindsight: during retain/consolidation and reflect phases.
- RAPTOR: offline/tree-build time.
- Letta: mostly at overflow/compaction time.

Recommendation for Relay:
- do lightweight observation/fact extraction at ingest
- do heavier summary/reflection generation asynchronously after ingest or on schedule

## F. Benchmark methodology

### F1. Expected Oracle -> S drop

- Large. Do not assume only `~11pp`.
- Official LongMemEval paper examples show much larger drops for end-to-end QA, often `25-30pp` or worse.
- Relay's `76.8%` Oracle likely implies a much lower `S` score unless architecture improves first.

### F2. Cheap way to run S

- Yes: create a stable 50-question stratified subset with representation across:
  - temporal reasoning
  - multi-session
  - knowledge update
  - preference
  - abstention
- Use that as a regression suite before full 500-question runs.

### F3. Other benchmarks worth considering

- LoCoMo: still useful, but easier to game and increasingly less representative.
- MemBench: useful but partly saturated by large-context readers.
- OMEGA's MemoryStress: most relevant extra benchmark in this research set.

### F4. What OMEGA's 95.4% vs 38.3% MemoryStress implies

- LongMemEval is useful, but it is not a full longitudinal-memory benchmark.
- Systems can look excellent on LongMemEval and still degrade badly under many sessions, contradictions, and cold-start/cross-agent conditions.
- Relay should treat LongMemEval as one regression check, not the product-defining benchmark.

## G. Production constraints

### G1. Improvements compatible with Vercel serverless

Good fits:
- better lexical/vector weighting
- cheap query decomposition
- deterministic temporal/entity filters
- session/project summary retrieval
- small cross-encoder rerank on tiny candidate sets via external service or very small model

Poor fits on pure Vercel serverless:
- heavy ColBERT indexing/reranking
- always-on local embedding/reranker services
- graph DB sidecars requiring warm state

### G2. Latency impact of reranking

- Small cross-encoder or LLM-free rerank over top-20/50 is plausible.
- ColBERT late interaction is viable only if indexed and hosted in a persistent service.
- RAGatouille's index-free rerank is too heavy for routine serverless use beyond small candidate sets.

### G3. Can graph memory work on Neon/Postgres?

- Yes, for the lightweight version Relay likely needs.
- You do not need Neo4j to add:
  - entity tables
  - fact tables
  - relation tables
  - valid-time filtering
  - graph-aware reranking heuristics

### G4. Cost-per-query impact by improvement tier

- Lowest cost: improved SQL hybrid scoring, temporal filters, entity extraction at write time
- Medium cost: query decomposition + summary retrieval + tiny reranker
- Highest cost: per-query LLM routing, late-interaction services, or always-on graph/rerank infrastructure

## Recommended implementation order for Relay

1. Add session summaries and project summaries above raw turns.
2. Add query decomposition for dates/entities/current-vs-historical intent.
3. Add fact history with valid-time semantics on top of existing supersedes.
4. Add second-stage reranking on top-30/50 candidates.
5. Evaluate a lightweight Observer/Reflector layer inspired by Mastra.
6. Only then consider a richer entity/fact graph layer if multi-session still lags.

## Proposed Relay target architecture

`capture -> raw memory_items + derived facts + session/project summaries -> hybrid search -> valid-time/entity filters -> rerank -> structured context pack with raw evidence + summaries`

That is the shortest credible path from current Relay to `>=85%`-class retrieval behavior without blowing up cost or complexity.
