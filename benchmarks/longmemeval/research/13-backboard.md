# 13. Backboard

Repo: `https://github.com/Backboard-io/Backboard-longmemEval-results`
Local clone: `/Users/alim/Research/relay-longmemeval/Backboard-longmemEval-results`
Status: results bundle plus small harness; useful but incomplete

## What is in repo

- A lightweight runner, evaluation wrapper, configs, and published run artifacts.
- Not a full self-contained benchmark package.
- Main files:
  - `src/backboard_runner.py`
  - `src/evaluation/evaluate_qa.py`
  - `scripts/run_backboard_benchmark.py`
  - `runs/*`

## Important benchmark details

- README headline says `93.4%`, but `runs/consolidated_results.json:6` shows `92.8%` on a majority-vote artifact.
- README explains the `93.4%` figure is under a `gpt-4o-mini` judge.
- Published run configs pin `gpt-4.1` as the answering model in `runs/*/config.json`.

## Retrieval / answer strategy clues

- `BackboardRunner.run_example()` in `src/backboard_runner.py:458` creates a fresh assistant and thread per question.
- If history fits the char cap, it sends the full conversation in one message via the fast path at `src/backboard_runner.py:507`.
- If not, it replays batched sessions and asks the question afterward at `src/backboard_runner.py:532`.
- This is important: the published score benefits from a "stuff the full history in one message if possible" shortcut.

## Prompting

- Benchmark prompts are explicit in:
  - `ASSISTANT_INSTRUCTIONS` at `src/backboard_runner.py:27`
  - `INLINE_PROMPT_SINGLE` at `:38`
  - `INLINE_PROMPT_BATCH_HEADER` at `:54`
  - `INLINE_PROMPT_QUESTION` at `:64`

## Reproducibility caveats

- Data in repo is partial; `s_cleaned` dataset is not checked in.
- Upstream LongMemEval clone is required.
- Raw per-question internal result trees are not fully present.

## Relay implications

- Backboard proves that very strong scores can come from answer-time packaging and judge sensitivity, not only retrieval architecture.
- Relay should not treat this as evidence for a reusable memory-system design.
- Useful lesson: benchmark reports must distinguish full-context stuffing from actual selective retrieval.
