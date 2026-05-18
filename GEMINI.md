# Gemini Overlay

@./AGENTS.md

This file is a Gemini CLI compatibility overlay. The shared repository policy lives in `AGENTS.md`.

## Gemini-Specific Relay Behavior

- Relay installs Gemini CLI hooks in `.gemini/settings.json` or `~/.gemini/settings.json`.
- Expected Relay hooks:
  - `PreCompress`
  - `SessionEnd`
  - `AfterAgent`
- Use `/memory show` when debugging the effective Gemini instruction context.
- If this repo is configured to load `AGENTS.md` via `context.fileName`, treat `AGENTS.md` as the canonical shared policy and keep this file minimal.

## Save Strategy

- Let `PreCompress` and `SessionEnd` handle normal autosave.
- Use `save` action `checkpoint` only for immediate durable milestones, not after every turn.
