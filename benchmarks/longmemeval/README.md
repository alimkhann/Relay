# LongMemEval harness for Relay

Runs [LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025) against Relay's
memory retrieval layer using a local Postgres + pgvector database.

## Setup

```bash
# 1. Start local Postgres (from repo root)
pnpm db:local:start
pnpm db:local:migrate
pnpm db:local:seed:user   # creates local@relay.test

# 2. Dataset
cd benchmarks/longmemeval
curl -L -o data/longmemeval_oracle.json \
  https://huggingface.co/datasets/xiaowu0162/longmemeval/resolve/main/longmemeval_oracle.json

# 3. Env
cp .env.example .env
# edit .env and paste a fresh OPENAI_API_KEY
```

## Run

```bash
# Dry run (no OpenAI) — verifies ingest + retrieve work against local DB
DRY_RUN=1 LIMIT_QUESTIONS=1 pnpm bench:longmemeval

# Small smoke run (real OpenAI, 5 questions, ~$0.02)
LIMIT_QUESTIONS=5 pnpm bench:longmemeval

# Full Oracle run (~500 questions, ~$0.80 on gpt-4o-mini + ~$1.25 judge)
pnpm bench:longmemeval
./evaluate.sh
```

The harness is resumable: each answered question is appended to
`data/hypotheses.jsonl` and skipped on re-run.

## Cost safety

`MAX_SPEND_USD` in `.env` caps total spend. The harness tracks actual token
usage from OpenAI responses and throws if projected total would exceed the cap.

## What this measures

Per question: we create a fresh project, ingest every turn of every haystack
session as an individual `memory_items` row with session + timestamp metadata,
search via `MemoryRepository.hybridSearch` (semantic + lexical), feed the top-K
results to `gpt-4o-mini` as context, and record its answer.

The judge is the official LongMemEval `evaluate_qa.py` with `gpt-4o`.

## Files

- `run.ts` — main loop
- `src/ingest.ts` — haystack → memory_items
- `src/retrieve.ts` — MemoryRepository search wrapper
- `src/answer.ts` — OpenAI answer generation
- `src/cost.ts` — running token counter + kill switch
- `src/embed.ts` — OpenAI embeddings for memory + queries
- `evaluate.sh` — clones LongMemEval and runs judge
