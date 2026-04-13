# 09. OMEGA

Sources:
- benchmark/whitepaper pages on `omegamax.co`
- repo `https://github.com/omega-memory/omega-memory`
Local clone: `/Users/alim/Research/relay-longmemeval/omega-memory`
Status: open source now exists; public marketing claims need normalization

## Architecture

- Query path starts at `src/omega/server/handlers.py:587` `handle_omega_query()`.
- Core retrieval implementation is `QueryMixin.query()` in `src/omega/sqlite_store/_query.py:43`.
- Storage is SQLite-first with:
  - `memories`
  - `edges`
  - `memories_vec`
  - `memories_fts`
  - `forgetting_log`
  - `memory_clusters`
- Schema is in `src/omega/schema.py:296`.

## CPU-only local stack

- Vector index uses `sqlite-vec` when available in `sqlite_store/_base.py:422`.
- Embeddings are generated locally with ONNX in `src/omega/embedding.py`.
- Default embedder is `bge-small-en-v1.5`; fallbacks include `all-MiniLM-L6-v2`.
- Reranker is also local ONNX in `src/omega/reranker.py`, with models such as `ms-marco-MiniLM-L-6-v2`.

## Retrieval pipeline

- Vector search is `_query_phase_vec()` in `sqlite_store/_query.py:382`.
- Lexical search is `_text_search()` in `sqlite_store/_search.py:78` using FTS5, BM25 normalization, overlap blending, and phrase expansion.
- Fusion is weighted RRF in `_rrf_fuse()` at `sqlite_store/_query.py:1450`.
- There is optional LLM query expansion in `src/omega/query_expansion.py:52`.
- Important note: official LongMemEval harness disables cross-encoder reranking by default because it reportedly hurt conversational memory retrieval; see `scripts/longmemeval_official.py:44`.

## Temporal handling

- Temporal range inference is `_infer_temporal_range()` in `src/omega/bridge.py:473`.
- Separate temporal search channel is `_temporal_search()` in `sqlite_store/_search.py:241`.
- Temporal penalties/boosts are applied in `_query_phase_boost()` at `sqlite_store/_query.py:847`.
- Schema also includes `valid_from` and `valid_until` in `src/omega/schema.py:228`.

## Benchmark methodology

- Official harness is `scripts/longmemeval_official.py`.
- It downloads cleaned `LongMemEval_S`, applies category-specific retrieval configs from `_CATEGORY_CONFIG` at `:354`, builds context, answers, and uses GPT-4o judging.
- OMEGA's public `95.4%` is a task-averaged score; public compare page also shows raw `466/500`, i.e. `93.2%` raw.
- Important: do not compare that headline directly to raw-accuracy numbers from other systems.

## MemoryStress

- Repo includes a real `benchmarks/memorystress/` tree.
- Metrics in `benchmarks/memorystress/metrics.py:66` cover age degradation, contradiction accuracy, cross-agent recall, cold-start recovery, and cost.
- This is much closer to Relay's actual problem space than LongMemEval alone.

## Relay implications

- OMEGA is strong evidence that hybrid retrieval plus temporal logic can reach high scores without GPUs or exotic infra.
- Best ideas to borrow:
  - lexical + vector + temporal fusion
  - local/small rerankers where they help
  - benchmark coverage beyond LongMemEval
- Biggest caution: OMEGA has category-specific benchmark tuning baked into retrieval profiles. Relay should avoid overfitting production behavior to benchmark taxonomies.
