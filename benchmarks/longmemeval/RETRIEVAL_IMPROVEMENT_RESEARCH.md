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
- **Published claim:** ~85% on LongMemEval (variant unclear)
- **What to look for:**
  - Is there ANY open-source code? If not, look for blog posts, papers, or technical descriptions
  - What architecture do they use? RAG? Graph? Hybrid?
  - What answerer model?
  - On which LongMemEval variant (_S, _M, Oracle)?
  - **Relay implication:** Are they doing something fundamentally different or is it engineering polish on known techniques?

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

### E. Benchmark methodology
1. What's the expected Oracle → _S score drop for a typical system?
2. Is there a way to run _S cheaply (subsample)?
3. Are there other memory benchmarks besides LongMemEval worth considering?

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
