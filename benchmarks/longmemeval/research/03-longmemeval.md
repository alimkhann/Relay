# 03. LongMemEval

Repo: `https://github.com/xiaowu0162/LongMemEval`
Local clone: `/Users/alim/Research/relay-longmemeval/LongMemEval`
Status: open, authoritative benchmark source

## Dataset structure

- `LongMemEval_S` is token-capped to about `115k` tokens and roughly `40-50` sessions depending on construction details.
- `LongMemEval_M` is about `500` sessions / `1.5M` tokens.
- `Oracle` includes only evidence sessions and no distractor haystack.
- Key references:
  - `README.md:74-76`
  - `data/custom_history/sample_haystack_and_timestamp.py:391-403`

## What an example contains

- Each item contains `question`, `answer`, `question_date`, `haystack_dates`, `haystack_session_ids`, `haystack_sessions`, and `answer_session_ids`.
- See `README.md:78-87` and `data/custom_history/sample_haystack_and_timestamp.py:391`.

## Retrieval baselines in repo

- `src/retrieval/run_retrieval.py:34` supports:
  - `flat-bm25`
  - `flat-contriever`
  - `flat-stella`
  - `flat-gte`
  - `oracle`
- Retrieval metrics are `recall_any`, `recall_all`, and `ndcg_any` at multiple `k` values in `src/retrieval/eval_utils.py:24-32`.

## High-value ablations

- Key expansion support is in `src/retrieval/index_expansion_utils.py:17`.
- Expansion types include `summary`, `keyphrase`, and `userfact`.
- Time-aware search pruning is in `src/index_expansion/temp_query_search_pruning.py:39`.
- Generation/reading ablations are in `src/generation/run_generation.py:193` and `src/generation/run_generation.sh:62`.

## Main paper takeaways reflected in code

- Best recipe is not plain flat retrieval.
- The paper's strongest retrieval pattern is round-level values + fact-expanded keys + strong reader prompt formatting.
- Time-aware query expansion helps a lot on temporal reasoning, especially with stronger LLMs.
- Chain-of-Note and JSON-style reading prompts outperform simpler reading prompts.

## Judge methodology

- Correctness is LLM-judged in `src/evaluation/evaluate_qa.py:24`.
- Default judge model is `gpt-4o-2024-08-06` in `src/evaluation/evaluate_qa.py:11`.
- Task-specific prompts cover temporal reasoning, knowledge update, preference, and abstention behavior in `src/evaluation/evaluate_qa.py:29-40`.
- This means "score" is not exact match; it is judged answer correctness.

## Oracle vs S gap

- Paper figures summarized by the code exploration show a large Oracle -> S drop.
- Example from paper-cited numbers: GPT-4o with CoN goes from about `0.924` on Oracle to `0.640` on S, roughly a `28pp` drop.
- So a small `~11pp` drop is not a safe assumption.

## Relay implications

- Oracle is useful for diagnosing retrieval quality, but it materially overestimates deployment performance.
- The biggest directly transferable ideas are:
  - fact/key expansion
  - time-aware query decomposition
  - stronger reading/answer prompts after retrieval
- Relay should expect a meaningful Oracle -> S decline if it moves off evidence-only evaluation.
- LongMemEval is directionally useful, but it is not sufficient for Relay's browser-chat -> coding-agent continuation use case.
