# Claude Overlay

This file is a Claude Code compatibility overlay. The canonical repository policy is in `AGENTS.md`.

## Read First

- Follow `AGENTS.md` for repo structure, test defaults, cost discipline, and edit rules.
- Use this file only for Claude-specific behavior.

## Claude-Specific Relay Behavior

- Relay installs Claude Code hooks in `~/.claude/settings.json`.
- Expected Relay hooks:
  - `PreCompact`
  - `SessionEnd`
  - `Stop`
  - `StopFailure`
- If you are debugging autosave behavior, verify loaded hooks with `/hooks`.
- If hooks are unavailable or disabled, call `checkpoint_context` manually before compaction, ending a session, or switching to a different task.

## Claude Usage Notes

- Keep tool use tight. Claude tends to over-explore unless instructed otherwise.
- Prefer one `rg` search and a few targeted reads over broad repo scans.
- Prefer `pnpm test:stable` before `pnpm test` unless the change genuinely needs the full suite.
