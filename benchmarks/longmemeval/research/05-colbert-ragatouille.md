# 05. ColBERT / RAGatouille

Repos:
- `https://github.com/stanford-futuredata/ColBERT`
- `https://github.com/AnswerDotAI/RAGatouille`
Local clones:
- `/Users/alim/Research/relay-longmemeval/ColBERT`
- `/Users/alim/Research/relay-longmemeval/RAGatouille`
Status: open, useful source

## What late interaction is

- ColBERT scores query/document matches at token level with `MaxSim` instead of collapsing each document to one embedding.
- Core scoring is `colbert_score()` in `ColBERT/colbert/modeling/colbert.py:158`.
- This sits between dense retrieval and cross-encoder reranking on the quality/latency tradeoff.

## Late interaction vs cross-encoder

- Cross-encoders jointly encode query+doc and usually give stronger pairwise reasoning, but they scale poorly.
- Late interaction pre-encodes documents, so search remains practical.
- Cross-encoder-related code exists in ColBERT, e.g. `colbert/distillation/scorer.py:15`, but the production retrieval surface is ColBERT's late-interaction index.

## APIs that matter

- Native ColBERT indexing/search:
  - `Indexer` in `ColBERT/README.md:111`
  - `Searcher` in `ColBERT/colbert/searcher.py:22`
- RAGatouille wrapper:
  - `RAGPretrainedModel.from_pretrained()` in `RAGatouille/ragatouille/RAGPretrainedModel.py:52`
  - `index()` in `.../RAGPretrainedModel.py:171`
  - `search()` in `.../RAGPretrainedModel.py:283`
  - `rerank()` in `.../RAGPretrainedModel.py:325`

## Can it rerank an existing pipeline?

- Yes.
- Best fit is indexed subset reranking: pass candidate `doc_ids` into `RAGPretrainedModel.search(..., doc_ids=...)` and let ColBERT score only that subset.
- This path flows through:
  - `RAGatouille/ragatouille/models/colbert.py:367`
  - `RAGatouille/ragatouille/models/index.py:305`
  - `ColBERT/colbert/search/index_storage.py:87`
- Index-free `rerank()` also exists but is only practical on small candidate sets.

## Latency and memory

- ColBERT README claims tens-of-milliseconds search in `ColBERT/README.md:8`.
- RAGatouille defaults to compressed indexes with `nbits=2` or `4` in `RAGatouille/ragatouille/models/index.py:168-170`.
- Index-free reranking stores encoded docs in RAM and degrades quickly as candidate count grows; see `RAGatouille/ragatouille/models/colbert.py:545` and `:697`.
- This is not a Vercel-serverless-first primitive unless candidate sets are tiny or the index is hosted elsewhere.

## Benchmark evidence

- Repos provide evaluators and claims, but not a clean LongMemEval table.
- ColBERT includes MS MARCO and LoTTE evaluation utilities in `utility/evaluate/`.
- RAGatouille documentation strongly argues quality gains over standard dense retrieval, but does not give a simple "expect +X pp on LongMemEval" number.

## Relay implications

- Most plausible use is second-stage reranking after Relay's pgvector + lexical retrieval.
- Recommended shape: retrieve top-50 with current SQL -> late-rerank to top-10/20.
- Avoid index-free reranking on every request in serverless.
- If Relay adds a reranker soon, a smaller cross-encoder may actually be operationally simpler than full ColBERT indexing; ColBERT becomes more compelling once memory volume grows and a persistent service exists.
