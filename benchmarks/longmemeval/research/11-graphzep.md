# 11. GraphZep

Repo: `https://github.com/aexy-io/graphzep`
Local clone: `/Users/alim/Research/relay-longmemeval/graphzep`
Status: open, directly relevant but implementation is inconsistent

## What it is

- A TypeScript attempt to port Zep/Graphiti-like temporal graph ideas.
- Codebase contains both property-graph (`src/core`, `src/zep`) and RDF/SPARQL (`src/rdf`) paths.

## Temporal schema

- `ZepMemory` and `ZepFact` declare `validFrom` and `validUntil` in `src/zep/types.ts:18` and `:39`.
- Property-graph entity edges use a different schema: `validAt`, `invalidAt`, `expiredAt` in `src/core/edges.ts:20` and `:104`.
- This means the repo actually has two competing temporal models.

## Ingestion

- Episode ingestion starts in `Graphzep.addEpisode()` at `src/graphzep.ts:140`.
- `ZepMemoryManager.addMemory()` in `src/zep/memory.ts:43` also calls `graphzep.addEpisode()` and separately writes `ZepMemory` / `ZepFact` records.
- Result: overlapping representations of the same content.

## Retrieval

- Main search entrypoint is `ZepRetrieval.search()` in `src/zep/retrieval.ts:23`.
- Pipeline is semantic search + substring lexical search + reciprocal rank fusion + optional MMR/graph-ish reranking.
- Important mismatch: docs talk about BM25 and graph traversal, but shipped TS retrieval mainly does embedding search plus simple lexical matching.

## Temporal filtering

- In the property-graph path, `semanticSearch()` in `src/zep/retrieval.ts:90` filters by `createdAt`, not true valid-time.
- RDF path has better temporal querying:
  - `getMemoriesAtTime()` in `src/rdf/sparql-interface.ts:91`
  - `getFactsAboutEntity()` in `src/rdf/sparql-interface.ts:125`
- But the RDF path also looks incomplete in places.

## Important gaps

- `validUntil` is declared in the Zep types but not consistently persisted in `src/zep/memory.ts:198-214`.
- Temporal semantics are stronger in docs than in the active property-graph retrieval code.

## Relay implications

- Best value here is conceptual portability: Relay can implement valid-time facts in Postgres/TypeScript without needing Neo4j.
- Do not copy the dual temporal schema or the split RDF/property-graph architecture.
- Recommendation: add a normalized fact table with `subject`, `predicate`, `object`, `valid_from`, `valid_until`, `source_memory_item_id`, then integrate valid-time filtering directly into Relay's existing hybrid SQL retrieval.
