# 01. Graphiti

Repo: `https://github.com/getzep/graphiti`
Local clone: `/Users/alim/Research/relay-longmemeval/graphiti`
Status: open, useful source

## Architecture

- Main ingest entrypoint is `graphiti_core/graphiti.py:916` `Graphiti.add_episode()`.
- Pipeline: ingest episode -> extract entities -> resolve entities -> extract edges/facts -> dedupe/resolve contradictions -> persist episode/entities/edges.
- Primary storage model is a temporal property graph, not a vector store with graph sprinkled on top.

## Schema

- Nodes live in `graphiti_core/nodes.py`.
- Important node types:
  - `EpisodicNode` in `graphiti_core/nodes.py:315`
  - `EntityNode` in `graphiti_core/nodes.py:492`
  - `CommunityNode` in `graphiti_core/nodes.py:676`
  - `SagaNode` in `graphiti_core/nodes.py:856`
- Edges live in `graphiti_core/edges.py`.
- Important edge types:
  - `EpisodicEdge` / `MENTIONS`
  - `EntityEdge` / `RELATES_TO` in `graphiti_core/edges.py:263`
  - group/community edges such as `HAS_MEMBER`, `HAS_EPISODE`, `NEXT_EPISODE`

## Temporal model

- `EntityEdge` stores `valid_at`, `invalid_at`, `expired_at`, `reference_time`, and supporting `episodes` in `graphiti_core/edges.py:267-280`.
- Contradicted facts are not deleted; older edges are closed by setting `invalid_at` and `expired_at`.
- Kuzu support uses an intermediate `RelatesToNode_` representation in `graphiti_core/models/edges/edge_db_queries.py:63-84`.

## Cross-session entity resolution

- Entity extraction starts in `graphiti_core/utils/maintenance/node_operations.py:65` `extract_nodes()`.
- Resolution happens in `graphiti_core/utils/maintenance/node_operations.py:490` `resolve_extracted_nodes()`.
- Candidate generation uses hybrid similarity plus dedup helpers in `graphiti_core/utils/maintenance/dedup_helpers.py:192-220`.
- Same entity mentioned across multiple sessions is merged into one canonical entity node plus more supporting episodes.

## Contradictions and knowledge updates

- Edge extraction starts in `graphiti_core/utils/maintenance/edge_operations.py:88` `extract_edges()`.
- Dedup and contradiction handling happens in `graphiti_core/utils/maintenance/edge_operations.py:248` `resolve_extracted_edges()` and `:457` `resolve_edge_contradictions()`.
- The LLM prompt in `graphiti_core/prompts/dedupe_edges.py:24-43` decides `duplicate_facts` and `contradicted_facts`.
- Old facts remain queryable through closed validity windows, which is better than hard deletion for "what used to be true?" questions.

## Retrieval pipeline

- Main search entrypoints are `Graphiti.search()` and `Graphiti.search_()` in `graphiti_core/graphiti.py:1456` and `:1532`.
- Retrieval orchestrator is `graphiti_core/search/search.py:98` `search()`.
- Search combines:
  - fulltext/BM25-like search via `edge_fulltext_search()` and `node_fulltext_search()` in `graphiti_core/search/search_utils.py:185` and `:579`
  - embedding similarity via `edge_similarity_search()` and `node_similarity_search()` in `graphiti_core/search/search_utils.py:300` and `:672`
  - optional graph traversal via `edge_bfs_search()` and `node_bfs_search()` in `graphiti_core/search/search_utils.py:448` and `:790`
- This is graph + embedding hybrid, not pure traversal.

## Reranking

- Available rerankers:
  - reciprocal rank fusion `rrf()` in `graphiti_core/search/search_utils.py:1780`
  - MMR `maximal_marginal_relevance()` in `graphiti_core/search/search_utils.py:1901`
  - node-distance reranker in `graphiti_core/search/search_utils.py:1798`
  - episode-mention reranker in `graphiti_core/search/search_utils.py:1860`
  - cross-encoder rerankers in `graphiti_core/cross_encoder/openai_reranker_client.py:61`, `bge_reranker_client.py:38`, and `gemini_reranker_client.py:73`

## Context construction

- Formatting helper is `graphiti_core/search/search_helpers.py:27` `search_results_to_context_string()`.
- It emits `<FACTS>`, `<ENTITIES>`, `<EPISODES>`, and `<COMMUNITIES>` blocks.
- Facts include `valid_at` and `invalid_at`, which is the right shape for update/history questions.
- Built-in QA prompt in `graphiti_core/prompts/eval.py:80` mainly uses entity summaries plus facts.

## Benchmark evidence

- I found LongMemEval-related eval coverage in `tests/evals/eval_e2e_graph_building.py:73`, but not a full in-repo retrieval QA harness matching the public score claim.
- Treat the reported `71.2%` as externally published, not fully reproduced from this repo alone.

## Relay implications

- Best transferable idea: keep contradictory facts accessible and close them with validity windows instead of overwriting them.
- Strong second idea: canonical entities should bridge sessions, then retrieval can pull both entity summaries and time-bounded facts.
- Weak spot to avoid copying: Graphiti exposes temporal fields but does not strongly enforce "current vs historical" filtering at retrieval time.
- For Relay, the likely fit is a lightweight fact/entity layer above `memory_items`, not a full graph-first replacement.
- Recommendation: add typed fact rows with `valid_from`, `valid_until`, `source_memory_item_id`, and optional canonical entity ids; keep pgvector as primary retrieval substrate and use graph relations for reranking/filtering.
