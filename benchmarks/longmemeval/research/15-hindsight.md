# 15. Hindsight

Sources:
- `https://github.com/vectorize-io/hindsight`
- Hindsight docs/blog/benchmark site
Local clone: `/Users/alim/Research/relay-longmemeval/hindsight`
Status: open, sophisticated architecture, strong meta-analysis

## Architecture

- Main API layer is in `hindsight-api-slim/hindsight_api/api/http.py`.
- Core engine is `MemoryEngine` in `hindsight-api-slim/hindsight_api/engine/memory_engine.py`.
- Core models are in `hindsight-api-slim/hindsight_api/models.py`.
- Important record types:
  - `Document`
  - `MemoryUnit`
  - `Entity`
  - `UnitEntity`
  - `MemoryLink`
  - `Bank`

## Memory types / layers

- `MemoryUnit.fact_type` supports `world`, `experience`, and `observation` in `models.py:123`.
- Pinned `mental_models` and `directives` sit above that in `memory_engine.py:6451` and `:7002`.
- Consolidation into observation facts happens in `engine/consolidation/consolidator.py:194`.
- This gives Hindsight an explicit layered memory design: raw-ish facts -> consolidated observations -> pinned higher-order models.

## Retrieval pipeline

- `_search_with_retries` in `memory_engine.py:2709` orchestrates retrieval.
- Parallel channels include:
  - semantic retrieval
  - BM25 retrieval
  - graph retrieval
  - temporal retrieval
- Fusion is `reciprocal_rank_fusion` in `engine/search/fusion.py:10`.
- Reranking uses `CrossEncoderReranker.rerank` in `engine/search/reranking.py:96`.
- Combined scoring is applied in `engine/search/reranking.py:20`.

## Graph retrieval

- Default graph retriever is `LinkExpansionRetriever` in `engine/search/link_expansion_retrieval.py:84`.
- It expands over entity links, semantic links, and causal links.
- Observation retrieval has a special pattern that uses source-memory ids to walk into world facts and related observations.

## Models

- Docs and code show default local embeddings as `BAAI/bge-small-en-v1.5`.
- Default reranker is `cross-encoder/ms-marco-MiniLM-L-6-v2`.
- LLM providers are pluggable, including OpenAI-compatible, Anthropic, and Claude Code integrations.

## LongMemEval harness

- Real benchmark code exists in:
  - `hindsight-dev/benchmarks/longmemeval/longmemeval_benchmark.py`
  - `hindsight-dev/benchmarks/common/benchmark_runner.py`
- Sessions are ingested as retained documents, then a single recall call retrieves evidence, then an LLM answers, then another LLM judges.
- Hindsight's own manifesto explicitly says benchmark scores depend on retrieval, prompts, and model roles together, not retrieval alone.

## Meta-analysis value

- Hindsight's blog argues LongMemEval and LoCoMo are increasingly partial signals now that long-context readers are better.
- That aligns closely with Relay's situation: LongMemEval is useful, but not enough.

## Relay implications

- Strongest transferable design idea: keep separate layers for raw evidence, consolidated observations, and pinned higher-order project/user models.
- Second strong idea: retrieval should explicitly combine semantic, lexical, graph, and temporal signals.
- Biggest mismatch: Hindsight is much more fact-graph-centric than Relay should probably be. Relay needs editable canon and provenance-rich workflow memory, not only extracted facts.
