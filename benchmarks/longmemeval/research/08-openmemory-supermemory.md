# 08. OpenMemory / Supermemory

Repo: `https://github.com/CaviraOSS/OpenMemory`
Local clone: `/Users/alim/Research/relay-longmemeval/OpenMemory`
Status: open, useful but uneven source

## Architecture

- Main API is `Memory.add()` / `Memory.search()` in `packages/openmemory-py/src/openmemory/main.py:20-27`.
- Add flow goes through `ingest_document()` and `add_hsg_memory()` in `ops/ingest.py:85` and `memory/hsg.py:379`.
- Query flow is `hsg_query()` in `memory/hsg.py:492`.
- It is primarily a heuristic hybrid retriever over text memories, with a separate temporal-fact subsystem.

## Storage model

- Python path stores metadata in SQLite and vectors in either SQLite or pgvector.
- Schema comes from `core/db.py` and migration `migrations/001_initial.sql`.
- Default storage unit is a whole text memory, not an extracted fact.
- Long docs are chunked into a root/child structure in `ops/ingest.py:85` using `split_text()` in `ops/ingest.py:16`.

## Retrieval

- Main ranking logic is `compute_hybrid_score()` in `memory/hsg.py:258`.
- Score blends vector similarity, token overlap, waypoint weight, recency, tag matches, and keyword bonus.
- Query expansion comes from `expand_via_waypoints()` in `memory/hsg.py:469`.
- There is no true learned reranker or cross-encoder in the default path.

## Graph component

- Lightweight graph is implemented as associative `waypoints`.
- `create_single_waypoint()` in `memory/hsg.py:268` creates nearest-neighbor links.
- Root-child ingestion also uses waypoint links.
- This is much lighter than Graphiti/Hindsight graph memory.

## Temporal handling

- Separate temporal fact store lives under `temporal_graph/`.
- `insert_fact()` in `temporal_graph/store.py:11` closes older active facts for the same `(subject, predicate)`.
- Point-in-time queries are in `temporal_graph/query.py:7` and range queries in `:49`.
- Problem: temporal facts are not tightly integrated into `Memory.search()`.
- There are also code inconsistencies between migration schema and runtime columns, so this subsystem looks immature.

## Benchmark evidence

- Hard in-tree evidence is weak.
- I found latency/throughput benchmarking in `tools/ops/benchmark.py:17`, but not a reproducible retrieval-quality harness backing published LongMemEval numbers.
- Treat benchmark claims here as partly documentary.

## Relay implications

- Best fit: use a lightweight associative edge layer plus richer hybrid scoring.
- Weak fit: keep temporal memory fully separate from main retrieval.
- Recommendation: Relay can borrow OpenMemory's practical hybrid-scoring instincts, but should integrate temporal facts and evidence retrieval into one ranking/query model instead of two disconnected systems.
