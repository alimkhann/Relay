# Retrieval Improvement Research Brief

> **For:** AI research agent (clone repos outside this project dir, do deep source analysis)
> **Goal:** Get Relay from 76.8% → ≥85% on LongMemEval Oracle, and build a defensible _S score
> **Date:** 2026-04-12

## Context

Relay is a memory sidecar for AI tools. It stores conversation turns as `memory_items` rows in Postgres with pgvector embeddings. Retrieval is hybrid (semantic cosine + lexical `websearch_to_tsquery`), scored and ranked in SQL.

Current LongMemEval Oracle scores (gpt-4o answerer, gpt-4o judge, 500 questions):
- **Overall: 76.80%**
- temporal-reasoning: 70.68% (133 questions)
- multi-session: 61.65% (133 questions) ← **primary bottleneck**
- knowledge-update: 83.33% (78 questions)
- single-session-preference: 73.33% (30 questions)
- single-session-user: 95.71% (70 questions, near ceiling)
- single-session-assistant: 96.43% (56 questions, near ceiling)

## What to research

For each repo below, clone it **outside** of this project directory, and investigate the specific questions listed. Use subagents in parallel where repos are independent.

---

### 1. Zep / Graphiti — Graph-based temporal memory
- **Repo:** `https://github.com/getzep/graphiti`
- **Published score:** 71.2% on LongMemEval **_S** (harder than Oracle)
- **What to look for:**
  - How does the knowledge graph schema work? What are nodes vs edges? How are temporal edges stored?
  - How does retrieval work — pure graph traversal, or graph + embedding hybrid?
  - How do they handle cross-session entity resolution (same entity mentioned in session 1 and session 5)?
  - How do they handle "knowledge updates" (user says X in session 1, then contradicts in session 4)?
  - What reranking do they do after initial retrieval?
  - How do they construct the context window for the answerer LLM?
  - **Key files to find:** graph schema, retrieval/search module, context assembly, their LongMemEval harness if they published one
  - **Relay implication:** Could we add a lightweight knowledge graph layer on top of our existing pgvector store? Or is the graph the *primary* index and embeddings secondary?

### 2. Mem0 — Memory layer for AI apps
- **Repo:** `https://github.com/mem0ai/mem0`
- **What to look for:**
  - Their "memory" abstraction — how do they chunk, store, and index memories?
  - Do they use a graph? If so, what's the schema?
  - How do they deduplicate/merge memories across sessions?
  - Their retrieval pipeline — embedding search → reranker → ??? 
  - Do they have a reranker step? If so, what model/approach?
  - How do they handle temporal context (dates, ordering)?
  - Any benchmark results they publish?
  - **Key files to find:** memory store implementation, search/retrieval module, any eval harness
  - **Relay implication:** What's their dedup/merge strategy? We have atomic fact extraction + supersedes — is there a better pattern?

### 3. LongMemEval official repo — Baselines and evaluation methodology
- **Repo:** `https://github.com/xiaowu0162/LongMemEval`
- **What to look for:**
  - What baselines do they report in the paper? What scores do MemWalker, ReadAgent, RAPTOR get?
  - How do the **_S** vs **_M** vs **Oracle** datasets differ structurally? How many distractor sessions in _S vs Oracle?
  - Their recommended evaluation methodology — are we running the judge correctly?
  - Any retrieval strategies that scored highest in their ablation studies
  - What is the gap between "perfect retrieval" (Oracle) and _S for the best systems? This tells us how much our score will drop when we move to _S
  - **Key files to find:** paper PDF or results tables, dataset construction scripts, baseline implementations
  - **Relay implication:** What's our expected _S score given 76.8% Oracle? What's the realistic ceiling?

### 4. RAPTOR — Recursive Abstractive Processing for Tree-Organized Retrieval
- **Repo:** `https://github.com/parthsarthi03/raptor`
- **What to look for:**
  - How does the tree-structured summarization work?
  - How do they cluster chunks before summarizing?
  - At retrieval time, do they search leaf nodes, intermediate summaries, or both?
  - What's the actual accuracy gain vs flat retrieval on their benchmarks?
  - **Key files to find:** clustering logic, tree building, retrieval traversal
  - **Relay implication:** Could we build conversation-level + project-level summary nodes above our turn-level `memory_items`? This could help multi-session by providing "session summaries" that bridge individual turns.

### 5. ColBERT / RAGatouille — Late-interaction reranking
- **Repo:** `https://github.com/AnswerDotAI/RAGatouille` (wrapper) and `https://github.com/stanford-futuredata/ColBERT`
- **What to look for:**
  - How does late-interaction reranking work vs cross-encoder reranking?
  - What's the typical accuracy lift over vanilla embedding retrieval?
  - Can it run as a reranker on top of an existing retrieval pipeline (retrieve top-50 with pgvector, rerank to top-20 with ColBERT)?
  - Memory/latency profile — can this run server-side on a Vercel serverless function or does it need GPU?
  - **Key files to find:** reranking API, index construction, benchmark comparisons
  - **Relay implication:** Top-K 20 from pgvector may miss relevant turns. Retrieve top-50, rerank to top-20 with a cross-encoder — expected +3–5pp on multi-session.

### 6. Emergence AI / Agent Memory
- **Repo:** search for `https://github.com/emergence-ai` or any public repo they've released
- **Published claim:** 86% on LongMemEval (gpt-4o, internal config, not publicly reproducible)
- **What to look for:**
  - Is there ANY open-source code? If not, look for blog posts, papers, or technical descriptions
  - What architecture do they use? RAG? Graph? Hybrid?
  - What answerer model?
  - On which LongMemEval variant (_S, _M, Oracle)?
  - **Relay implication:** Are they doing something fundamentally different or is it engineering polish on known techniques?

### 7. Mastra Observational Memory (OM) — Observer/Reflector compression
- **Repo:** `https://github.com/mastra-ai/mastra`
- **Published score:** 94.87% (gpt-5-mini), 84.23% (gpt-4o) — **highest reproducible OSS score**
- **What to look for:**
  - The Observer agent: what does it extract from each conversation turn? How does it decide what's worth storing vs discarding?
  - The Reflector agent: how does it compress conversation into a "stable, prompt-cacheable log"? What's the ~6× compression ratio mechanism?
  - How does the two-agent pipeline interact? Is it synchronous per-turn or batch?
  - How do they construct the final context window for the answerer? Do they inject the compressed log as system prompt, or as retrieved context?
  - What's the schema of their memory store?
  - **Key files to find:** Observer implementation, Reflector implementation, memory store schema, their LongMemEval harness
  - **Relay implication:** Their architecture jumped 9pp (84→93) on model upgrade vs Supermemory's 3.6pp — "architecture quality amplifies model quality." What about their design enables this? Could we add an Observer/Reflector layer on top of our existing `memory_items` store?
  - Also check: `https://github.com/mastra-ai/mastra-observational-memory-workshop` — may have a simpler reference implementation

### 8. Supermemory — Source-available memory layer
- **Repo:** `https://github.com/CaviraOSS/OpenMemory` (source-available fork)
- **Published score:** 85.20% (gemini-3-pro-preview), 81.60% (gpt-4o)
- **What to look for:**
  - Memory storage and retrieval architecture — what makes it score 10pp above Zep?
  - How do they handle temporal context?
  - What embedding model and reranking strategy?
  - How do they chunk/store — raw turns, extracted facts, or summaries?
  - Any graph component or pure vector?
  - **Key files to find:** memory store, search/retrieval pipeline, ingestion pipeline
  - **Relay implication:** I studied their code before building Relay. Revisit with fresh eyes — what did they add since then that lifted them to 85%?

### 9. OMEGA — Highest published score (95.4%)
- **Repo:** Proprietary SaaS, no source code. Check `https://omegamax.co/benchmarks` for architecture details
- **Published score:** 95.4% (GPT-4.1, CPU-only, local)
- **What to look for:**
  - Any blog posts, papers, or technical descriptions of their architecture
  - They claim CPU-only local execution — what inference/retrieval stack enables this?
  - They also ran MemoryStress (1000 sessions, 625 facts, 10 months simulated) — scored only 38.3%. What does this reveal about their architecture's limitations at true longitudinal scale?
  - They note HotpotQA and MemBench are "saturated" (fit in 128K context) — do they treat LongMemEval-M as the real test?
  - **Relay implication:** Even if closed-source, their public benchmark data and blog posts may reveal architectural patterns worth adopting

### 10. Letta — Tiered OS-inspired memory
- **Repo:** `https://github.com/letta-ai/letta`
- **Stars:** ~21K, Apache 2.0
- **What to look for:**
  - Their tiered memory model: in-context → recall → archival. How does each tier work?
  - The archival layer — how does it decide when to compress old memory into denser representations?
  - How does recall search work across tiers?
  - Memory eviction/promotion policies — when does something move from recall to archival?
  - **Key files to find:** memory tier implementations, compression/archival logic, retrieval across tiers
  - **Relay implication:** We'll need a compression layer before LongMemEval_S (200–1600 turns). Letta's archival tier is the most mature OSS implementation of this concept.

### 11. GraphZep — TypeScript temporal knowledge graph
- **Repo:** `https://github.com/aexy-io/graphzep`
- **What to look for:**
  - TypeScript port of Graphiti's temporal KG logic — directly relevant to our stack
  - How are `validFrom`/`validUntil` temporal edges implemented?
  - How does temporal filtering work at query time?
  - **Key files to find:** graph schema, temporal edge model, query-time date filtering
  - **Relay implication:** Most portable reference for adding temporal KG to our Postgres-based store, since it's TypeScript like us

### 12. Ensue.dev — Claude Code plugin pipeline
- **Repo:** `https://github.com/mutable-state-inc/ensue-skill`
- **Published score:** 88.2% using only open-source models
- **What to look for:**
  - How does their pipeline achieve 88.2% with OSS models? What models do they use?
  - Their memory extraction and retrieval architecture
  - Is there anything we can learn for our own MCP/Claude Code integration?
  - **Relay implication:** They're a Claude Code plugin like us. 88.2% with OSS models is impressive — what are they doing differently?

### 13. Backboard — 93.4% full 500q run
- **Repo:** `https://github.com/Backboard-io/Backboard-longmemEval-results` (results only)
- **What to look for:**
  - Results repo may contain config details, harness setup, or architecture notes
  - Any blog posts or documentation about their approach
  - **Relay implication:** 93.4% is very high — even partial architecture insight is valuable

### 14. MemPalace — Skeptical analysis
- **Repo:** search for their public claims
- **Claimed score:** "perfect 100%" on LoCoMo
- **IMPORTANT: Treat with heavy skepticism.** Publicly debunked on Reddit (April 2026):
  - LoCoMo 100% uses `top-k=50` exceeding total session count (bypasses retrieval entirely)
  - LongMemEval score involves "special-case adjustments" for 3 failures
  - See: `https://www.reddit.com/r/MachineLearning/comments/1seunbr/d_mempalace_claims_100_on_locomo_and_a_perfect/`
- **What to look for:**
  - Verify the debunk claims — is there any legitimate architectural contribution under the gaming?
  - If the core retrieval (ignoring the gaming) has any novel ideas worth noting
  - **Relay implication:** Anti-pattern reference. Document what NOT to do in benchmark methodology.

### 15. Hindsight (Vectorize) — Agent Memory Benchmark manifesto
- **Published score:** 91.40% (gemini-3-pro-preview), 89.00% (GPT-OSS 120B)
- **Blog:** `https://hindsight.vectorize.io/blog/2026/03/23/agent-memory-benchmark`
- **What to look for:**
  - Their "Agent Memory Benchmark: A Manifesto" is a meta-analysis of what makes architectures win vs lose
  - Architecture details behind 91.4% score
  - **Relay implication:** Read as a meta-guide for prioritizing improvements

---

## Current competitive landscape (for context)

From Perplexity research (April 2026):

| System | Score | Model | OSS? | Dataset |
|---|---|---|---|---|
| OMEGA | 95.4% | GPT-4.1 | ❌ | _S |
| Mastra OM | 94.87% | gpt-5-mini | ✅ Apache 2.0 | _S |
| MemLayer (ProcIQ) | 94.4% | — | ❌ | _S |
| Backboard | 93.4% | — | ❌ (results only) | _S |
| Mastra OM | 93.27% | gemini-3-pro | ✅ | _S |
| Hindsight | 91.40% | gemini-3-pro | ❌ | _S |
| Ensue.dev | 88.2% | OSS models | partial | _S |
| EmergenceMem | 86.0% | gpt-4o | ❌ | _S |
| Supermemory | 85.20% | gemini-3-pro | ⚠️ source-avail | _S |
| Mastra OM | 84.23% | gpt-4o | ✅ | _S |
| Oracle baseline | 82.40% | gpt-4o | — | Oracle |
| **Relay (current)** | **76.80%** | **gpt-4o** | **building** | **Oracle** |
| Zep/Graphiti | 71.2% | gpt-4o | ✅ MIT | _S |
| Full context | 60.2% | gpt-4o | — | _S |

**Key insight:** All top systems run on **_S**, not Oracle. Relay's 76.8% Oracle ≈ estimated 65–72% on _S. The gap to close is architectural, not model-dependent — Mastra OM scores 84.23% on _S with the same gpt-4o we use.

**Key insight 2:** "Architecture quality amplifies model quality" — Mastra OM jumped 9pp on model upgrade (84→93) vs Supermemory's 3.6pp. Better architecture = better returns from better models.

---

## Specific technical questions to answer

After analyzing all repos, synthesize answers to these questions:

### A. Retrieval architecture
1. What's the best retrieval pipeline shape for conversational memory? (flat embedding → reranker → LLM? or graph → embedding → reranker?)
2. Is a knowledge graph necessary for ≥85%, or can flat retrieval + reranking get there?
3. What embedding model + dimension gives best cost/quality tradeoff? (`text-embedding-3-large` @ 3072 vs `text-embedding-3-small` @ 768 vs open-source like `nomic-embed-text`)

### B. Multi-session (Relay's weakest category)
1. How do high-scoring systems link facts across sessions?
2. Is session-level summarization (RAPTOR-style) necessary, or does entity-centric retrieval suffice?
3. What query decomposition strategies help for multi-hop questions?

### C. Knowledge updates
1. How do Zep/Mem0 handle contradictions (user says X then later says Y)?
2. Is Relay's supersedes relation the right model, or do high-scoring systems keep both versions accessible?
3. When the question asks about the *old* state, how do systems retrieve it?

### D. Prompt engineering
1. What system prompts do high-scoring harnesses use? Any few-shot examples?
2. Do any systems use chain-of-thought before answering?
3. How do systems handle the "I don't know" decision — what's the optimal abstention strategy?

### E. Compression and scaling
1. How does Mastra OM's ~6× compression ratio work? What's the compression quality tradeoff?
2. What's Letta's archival tier eviction policy? When does it compress vs keep raw turns?
3. Is there a middle ground between "store every turn" (Relay now) and "aggressive compression" (Mastra OM) that preserves retrieval precision?
4. How do top systems handle LongMemEval_S's 200–1600 turns? Do they pre-compress at ingest time, at query time, or both?

### F. Benchmark methodology
1. What's the expected Oracle → _S score drop for a typical system? (Oracle baseline is 82.4%, Zep _S is 71.2% — is that ~11pp gap consistent?)
2. Is there a way to run _S cheaply (subsample 50 questions)?
3. Are there other memory benchmarks worth considering? (LoCoMo, MemBench, MemoryStress by OMEGA)
4. OMEGA scored 95.4% on LongMemEval but only 38.3% on their own MemoryStress — what does this imply about LongMemEval as a benchmark?

### G. Production constraints
1. Which improvements work within Vercel serverless (no GPU, 10s timeout, cold starts)?
2. What's the latency profile of adding a reranker to the retrieval pipeline?
3. Can graph-based memory work with Neon Serverless Postgres, or does it require Neo4j/similar?
4. What's the cost-per-query impact of each improvement tier?

---

## Output format

Write findings to: `benchmarks/longmemeval/research/` directory (create it). One file per repo analyzed + one `SYNTHESIS.md` that answers the questions in section above and provides a prioritized implementation roadmap for reaching ≥85%.

Prioritize by: (1) expected accuracy gain, (2) implementation difficulty, (3) cost impact on production retrieval latency.

---

## Current Relay retrieval pipeline (for reference)

```
User query
  → embed with text-embedding-3-small (768d)
  → SQL hybrid search:
      CTE 1: semantic — cosine similarity on pgvector `embedding` column
      CTE 2: lexical — websearch_to_tsquery on `search_vector` tsvector column
      CTE 3: combined — deduplicate, take max score per item
      Final: score × recency_decay × (1 if not superseded else 0), ORDER BY score DESC LIMIT K
  → top-K chunks assembled into numbered context with (date, surface) headers
  → system prompt (fact mode / recommendation mode split)
  → gpt-4o answer generation
```

No reranker. No graph. No query decomposition. No session-level summaries. These are all potential improvement vectors.
