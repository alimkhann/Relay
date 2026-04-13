# LongMemEval harness for Relay

Runs [LongMemEval](https://github.com/xiaowu0162/LongMemEval) (ICLR 2025) against Relay's
memory retrieval layer using a local Postgres + pgvector database.

## Setup

```bash
# 1. Start local Postgres (from repo root)
pnpm db:local:start
pnpm db:local:migrate
pnpm db:local:seed:user   # creates local@relay.test and prints the profile id

# 2. Dataset
cd benchmarks/longmemeval
curl -L -o data/longmemeval_oracle.json \
  https://huggingface.co/datasets/xiaowu0162/longmemeval/resolve/main/longmemeval_oracle.json

# 3. Env
cp .env.example .env
# edit .env, paste RELAY_TEST_USER_ID from the seed command, and paste a fresh OPENAI_API_KEY
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

## Benchmark correctness guardrails

The harness now runs a preflight before every benchmark:
- verifies the dataset exists
- verifies the benchmark user exists
- verifies the latest Relay SQL migration is applied in the target DB
- records the current git SHA to `results/last-preflight.json`

Important: this harness runs in `local-source` mode, so it uses the current checked-out Relay code directly via `tsx` imports. That means a deployment is not required for correctness, but the target database must still have the latest migrations applied.

Recommended sequence before any meaningful run:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm db:local:migrate
DRY_RUN=1 pnpm bench:longmemeval
```

Only benchmark a deployed environment if the benchmark explicitly depends on hosted web surfaces. For retrieval/canon benchmarking, local-source mode is the preferred path because it avoids stale deploy confusion.

## Relay-native eval scaffolding

Relay-specific scenarios now live in `data/relay_native_scenarios.json`.

These are not a full scored benchmark yet, but they define the categories Relay should be measured on beyond LongMemEval:
- browser ideation -> coding agent continuity
- current vs historical truth
- locked-canon conflict handling

## Cost safety

`MAX_SPEND_USD` in `.env` caps total spend. The harness tracks actual token
usage from OpenAI responses and throws if projected total would exceed the cap.

## What this measures

Per question: we create a fresh project, ingest every turn of every haystack
session as an individual `memory_items` row with session + timestamp metadata,
also create lightweight `session_summary` snapshots, retrieve across raw memory
and session summaries, feed the top-K context to the answer model, and record its answer.

The judge is the official LongMemEval `evaluate_qa.py` with `gpt-4o`.

## Files

- `run.ts` — main loop
- `src/ingest.ts` — haystack → memory_items
- `src/retrieve.ts` — raw memory + session summary retrieval wrapper
- `src/answer.ts` — OpenAI answer generation
- `src/cost.ts` — running token counter + kill switch
- `src/embed.ts` — OpenAI embeddings for memory + queries
- `src/query.ts` — deterministic query analysis for current/historical retrieval hints
- `evaluate.sh` — clones LongMemEval and runs judge
