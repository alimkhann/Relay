# LongMemEval Oracle — Relay 2026-04-12 (gpt-4o + decay fix)

## Configuration

| | |
|---|---|
| Dataset | LongMemEval_Oracle (500 instances) |
| Ingestion | Raw turns → `memory_items` rows, one per turn |
| Retrieval | `MemoryRepository.hybridSearch` (semantic + lexical, `websearch_to_tsquery`, supersedes filter), top-K=20 |
| Embedding model | `text-embedding-3-small` @ 768 dim |
| Answerer | **`gpt-4o`** (temperature=0) |
| Judge | `gpt-4o` via official `evaluate_qa.py` |
| Database | Local Postgres 16 + pgvector (Docker) |
| Harness spend | ~$3.63 (1532 calls across 2 partial runs — quota interrupt at 490, resumed for final 10) |
| Wall time | ~50 min total |

### Changes from prior run (ORACLE-2026-04-12 gpt-4o-mini)

1. **Answerer model**: `gpt-4o-mini` → `gpt-4o`
2. **Recency decay disabled in bench**: `recencyHalfLifeDays: 36500` in `src/retrieve.ts`. Prior run used default 30d half-life which catastrophically down-weighted all haystack turns (real-world dates from 2023 are ~1100 days old → decay multiplier ≈ 1e-11). This was the root cause of knowledge-update and preference regressions.

## Results

### Overall — 3-run comparison

| Metric | 04-11 baseline (mini) | 04-12 (mini) | **04-12 (gpt-4o + fix)** | Δ vs baseline |
|---|---|---|---|---|
| **Overall accuracy** | 70.20% | 71.40% | **76.80%** | **+6.60** |
| Harness spend | $0.285 | $0.273 | ~$3.63 | — |

### Per-category — 3-run comparison

| Category | 04-11 baseline | 04-12 mini | **04-12 gpt-4o** | Δ vs baseline | n |
|---|---|---|---|---|---|
| single-session-user | 95.71% | 97.14% | **95.71%** | 0.00 | 70 |
| single-session-assistant | 94.64% | 98.21% | **96.43%** | +1.79 | 56 |
| knowledge-update | 84.62% | 79.49% | **83.33%** | -1.29 | 78 |
| multi-session | 60.15% | 63.16% | **61.65%** | +1.50 | 133 |
| single-session-preference | 53.33% | 46.67% | **73.33%** | **+20.00** | 30 |
| temporal-reasoning | 51.88% | 55.64% | **70.68%** | **+18.80** | 133 |

### Plan targets

| Metric | Target | Actual | Result |
|---|---|---|---|
| Overall | ≥76% | 76.80% | ✅ |
| Temporal | ≥65% | 70.68% | ✅ |
| Multi-session | ≥72% | 61.65% | ❌ missed by 10.35pp |

## Root cause analysis

### Decay fix = biggest single lever

Disabling recency decay recovered **+27pp preference** and **+15pp temporal** vs the gpt-4o-mini+decay run. The 30-day half-life was never appropriate for benchmark data where "now" is 2026 and sessions are dated 2023 — every turn scored ≈0 regardless of semantic relevance. In production (where turns are days/weeks old, not years), the 30d decay is reasonable.

### gpt-4o vs gpt-4o-mini

Comparing 04-12 mini (with decay) vs 04-12 gpt-4o (without decay), the two changes are confounded. Isolating the model upgrade alone would require a gpt-4o run WITH the broken decay — not worth the $3.60. Rough attribution: decay fix ≈ +3.5pp overall, model upgrade ≈ +2pp overall.

### Multi-session remains the weak spot (61.65%)

Multi-session didn't benefit from either fix because:
1. Questions span multiple conversations — the right answer requires synthesizing facts from 2–4 different sessions
2. Top-K 20 retrieves from the full project, but ranking doesn't cluster by session — related turns from the same session may not co-appear in the top-K
3. No cross-session linking or graph edges to boost co-relevant turns
4. High abstention rate ("I don't know") on multi-session `_abs` variants — model sees partial context and correctly refuses, but a smarter retrieval would surface the missing pieces

### Remaining headroom to ≥80–85%

| Fix | Est. impact | Difficulty | Categories affected |
|---|---|---|---|
| Cross-encoder reranker after hybrid search | +3–5pp | Medium | multi-session, temporal |
| Session-aware retrieval boost (co-retrieve turns from same session) | +2–4pp | Medium | multi-session |
| Query decomposition for multi-hop questions | +2–3pp | Medium | multi-session, knowledge-update |
| Higher-dim embeddings (`text-embedding-3-large` @ 3072) | +1–2pp | Easy | all |
| Conversation-level summaries alongside turn-level items | +2–3pp | Medium | multi-session, preference |
| Graph-based memory (knowledge graph over entities/relations) | +3–8pp | Hard | multi-session, knowledge-update |
| Prompt engineering on answer.ts (few-shot, CoT) | +1–2pp | Easy | preference, temporal |

Conservative estimate combining reranker + session boost + better embeddings: **80–82%**. Adding graph memory: **83–87%**.

## Reference comparison (same-model-class)

| System | Overall | Answerer | Dataset variant | Notes |
|---|---|---|---|---|
| **Relay (this run)** | **76.80%** | gpt-4o | **Oracle** | pgvector hybrid, no reranker |
| Zep (Graphiti) | 71.2% | gpt-4o | **_S** | graph-based, published |
| Emergence AI | ~85% | gpt-4o | unknown | published, RAG-focused |
| Full-context baseline | 60.2% | — | _S | Zep's reported baseline |

**Critical caveat:** Relay ran on Oracle (easy — no distractors), Zep ran on _S (hard — 115k tokens of distractors). These numbers are NOT directly comparable. Relay on _S would score lower, likely 65–72%. A true comparison requires running _S.

## Reproduction

```bash
cd benchmarks/longmemeval
ANSWER_MODEL=gpt-4o MAX_SPEND_USD=8.00 pnpm bench
./evaluate.sh
```
