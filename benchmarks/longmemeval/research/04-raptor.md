# 04. RAPTOR

Repo: `https://github.com/parthsarthi03/raptor`
Local clone: `/Users/alim/Research/relay-longmemeval/raptor`
Status: open, useful source

## Core idea

- Build a tree of leaf chunks plus recursively generated summary nodes.
- Retrieve across multiple abstraction levels, not just leaves.

## Tree building

- Entry flow is `RetrievalAugmentation.add_documents()` in `raptor/RetrievalAugmentation.py:204`.
- Leaves are built from `TreeBuilder.build_from_text()` in `raptor/tree_builder.py:260`.
- Chunks come from `split_text()` in `raptor/utils.py:22`.
- Tree node model is `Node` / `Tree` in `raptor/tree_structures.py:4-16`.

## Clustering

- Recursive cluster construction is `ClusterTreeBuilder.construct_tree()` in `raptor/cluster_tree_builder.py:55`.
- Clustering uses UMAP + GMM in `raptor/cluster_utils.py:23`, `:37`, `:46`, and `:60`.
- Clustering is soft: one chunk can contribute to multiple clusters if posterior probability passes threshold.
- Oversized clusters are recursively reclustered in `raptor/cluster_utils.py:171`.

## Summarization

- Parent summaries are produced by `TreeBuilder.summarize()` in `raptor/tree_builder.py:195`.
- Default summarizer is `GPT3TurboSummarizationModel.summarize()` in `raptor/SummarizationModels.py:17`.
- Summaries are abstractive and not provenance-aware by default.

## Retrieval

- Retrieval entrypoint is `RetrievalAugmentation.retrieve()` in `raptor/RetrievalAugmentation.py:222`.
- `TreeRetriever.retrieve()` in `raptor/tree_retriever.py:252` supports two modes:
  - `collapse_tree=True`: retrieve across all nodes in all layers
  - `collapse_tree=False`: layer-by-layer traversal following selected parents downward
- Collapsed retrieval is the most relevant pattern for conversational memory because questions vary in abstraction level.

## Flat baseline

- Repo includes `FaissRetriever` in `raptor/FaissRetriever.py:82` as a flat comparison point.
- This makes the tree-vs-flat design explicit.

## Reported gains

- Repo points to the paper rather than shipping benchmark tables.
- Paper-reported gains are meaningful, but the most useful insight is structural: retrieving intermediate summaries helps when the answer requires synthesis above individual chunks.

## Relay implications

- Best fit: build session-level and project-level summaries above turn-level memory items.
- Do not use summaries as a replacement for raw evidence; use them as additional retrievable nodes.
- Retrieval should search leaves + summaries together, like RAPTOR's collapsed mode.
- Relay needs summary invalidation/recomputation rules, because project memory changes more often than static documents.
- Recommendation: add `session_summary` and `project_summary` memory types with `derived_from` lineage, then search all levels together.
