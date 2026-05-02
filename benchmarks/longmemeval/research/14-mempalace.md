# 14. MemPalace

Repo: `https://github.com/MemPalace/mempalace`
Local clone: `/Users/alim/Research/relay-longmemeval/mempalace`
Status: open, but heavily benchmark-shaped; important anti-pattern reference

## Core product retrieval reality

- Main search path is `mempalace/searcher.py:96` `search_memories()`.
- It performs a single ChromaDB query with optional `wing` / `room` metadata filters.
- Storage backend is `PersistentClient` in `mempalace/backends/chroma.py:74`.
- There is no graph traversal, no learned reranker, and no advanced hybrid system in the core product search path.

## Chunking / ingestion

- Project miner chunks by character windows in `mempalace/miner.py:323`.
- Conversation miner chunks by exchange pairs in `mempalace/convo_miner.py:39`.
- Room assignment is largely heuristic keyword/path labeling in `detect_room()` and `detect_convo_room()`.

## AAAK

- AAAK lives in `mempalace/dialect.py:545` `Dialect.compress()`.
- It is heuristic lossy summarization using extracted topics, a key sentence, emotion codes, and flags.
- It is not a genuine lossless compression layer.
- Repo and issue history confirm AAAK hurt benchmark quality relative to raw retrieval.

## Palace / graph features

- `mempalace/palace_graph.py` implements a lightweight room graph plus BFS traversal.
- Knowledge graph in `mempalace/knowledge_graph.py:50` is a local SQLite triples table with temporal validity operations.
- Important: these components are not the core retrieval path that produced the headline benchmark numbers.

## LongMemEval benchmark reality

- Benchmark logic is mostly in `benchmarks/longmemeval_bench.py`.
- Raw strong baseline is `build_palace_and_retrieve()` in `benchmarks/longmemeval_bench.py:163`.
- Later variants (`hybrid_v3`, `hybrid_v4`, question hall classification, Claude rerank winner-picking) are increasingly benchmark-specific and tuned to known miss patterns.
- `hybrid_v4` even documents case-specific fixes in the code around `benchmarks/longmemeval_bench.py:1339` onward.

## Skeptic verdict

- Legitimate contribution: very strong raw verbatim-retrieval baseline and a reminder that raw evidence often beats over-compression.
- Overclaimed contribution: palace structure and AAAK as the source of headline results.
- Anti-patterns:
  - benchmark-specific heuristics baked into the benchmark script rather than product retrieval
  - conflating retrieval metrics with broader memory quality
  - README/code drift on what is actually driving performance

## Relay implications

- Positive takeaway: do not prematurely compress away verbatim evidence.
- Negative takeaway: do not market benchmark-specific hacks as product architecture.
- Relay should publish methodology details beside scores and keep held-out evals separate from tuned benchmark runs.
