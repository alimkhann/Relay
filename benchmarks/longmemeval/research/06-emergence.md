# 06. Emergence AI / Agent Memory

Repo / sources:
- `https://github.com/EmergenceAI/emergence_simple_fast`
- blog posts on `emergence.ai`
Local clone: `/Users/alim/Research/relay-longmemeval/emergence_simple_fast`
Status: partial open source; strongest system remains closed

## Public repo reality

- Public repo is a very small baseline called "Simple RAG for LongMemEval".
- Main implementation is almost entirely in `main.py`.
- Entry symbols:
  - `process_haystack()` in `main.py:14`
  - `process_question()` in `main.py:24`
  - `Evaluator` in `main.py:83`

## What the OSS baseline does

- Flattens all haystack sessions into dated turn strings in `main.py:14-22`.
- Embeds turns with local `all-MiniLM-L6-v2` from `sentence-transformers` in `main.py:6`.
- Retrieves top-42 turns with `util.semantic_search()` in `main.py:29`.
- Calls `gpt-4o` once to extract relevant facts from retrieved turns and again to answer from those facts plus the turns in `main.py:31-58`.
- Judge is also `gpt-4o` in `main.py:84-100`.

## What is not public

- The stronger `86%` LongMemEval claim is described in Emergence blog posts, not reproduced in this repo.
- Public descriptions mention a richer internal system with turn retrieval, session scoring, extracted facts/episodes, and a semantic graph.
- That architecture is closed.

## Architecture hints from public writing

- Emergence blog claims the stronger stack uses:
  - turn-level retrieval
  - whole-session scoring from turn rankings/NDCG
  - extracted facts and episodes
  - semantic graph structures
  - chain-of-thought style answer prompting
- Treat these as public descriptions, not verified source-level findings.

## Relay implications

- The OSS repo itself is only a useful flat-RAG baseline.
- Strongest public lesson is that session-aware scoring and a graph/fact layer probably matter more than the tiny OSS baseline suggests.
- Also a caution: high benchmark numbers can come from large top-k retrieval plus strong answerer/judge models rather than a durable product memory design.

## Verdict

- Open source exists, but only for a simplified baseline.
- For the stronger EmergenceMem architecture: closed, limited findings.
