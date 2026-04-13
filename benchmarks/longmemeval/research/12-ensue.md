# 12. Ensue.dev

Repo: `https://github.com/mutable-state-inc/ensue-skill`
Local clone: `/Users/alim/Research/relay-longmemeval/ensue-skill`
Status: open, but thin; no useful retrieval source code

## What is actually in the repo

- Only 17 tracked files.
- Mostly plugin metadata, Claude hooks, shell scripts, and prompt/skill instructions.
- Key files:
  - `hooks/hooks.json`
  - `scripts/*.sh`
  - `skills/ensue-memory/SKILL.md`
  - `agents/research-learner.md`

## What it does

- Captures session events via Claude Code hooks.
- Sends batched JSON-RPC calls to a remote Ensue API in `scripts/ensue-api.sh:31`.
- Local repo does not contain retrieval, ranking, storage, embedding, or evaluation logic.

## What is missing

- No LongMemEval harness.
- No published `88.2%` run artifact.
- No model selection code.
- No memory schema.
- No visible retrieval pipeline.

## Useful integration ideas

- Hook-based capture is relevant to Relay:
  - `SessionStart`
  - `UserPromptSubmit`
  - `PostToolUse`
  - `PreCompact`
  - `Stop`
  - `SessionEnd`
- Batching and namespace organization are also useful product ideas.

## Verdict

- Closed, no findings on retrieval architecture.
- Useful as a Claude Code plugin integration reference only.
