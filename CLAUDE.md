# Claude Overlay

This file is a Claude Code compatibility overlay. The canonical repository policy is in `AGENTS.md`.

## Read First

- Follow `AGENTS.md` for repo structure, test defaults, cost discipline, and edit rules.
- Follow `AGENTS.md` → "Feature Dev Lifecycle": for major/medium features keep the dev server + Neon dev branch alive until the user has tested and we've shipped to prod, then tear down; small/visual changes need only a local check or a Playwright screenshot. Run a Playwright e2e pass before handing a feature to the user, and verify the full runtime chain (deferred jobs/caches/budget gates can silently no-op), not just that code compiles.
- Use this file only for Claude-specific behavior.

## Claude-Specific Relay Behavior

- Relay installs Claude Code hooks in `~/.claude/settings.json`.
- Expected Relay hooks:
  - `PreCompact`
  - `SessionEnd`
  - `StopFailure`
- If you are debugging autosave behavior, verify loaded hooks with `/hooks`.
- If hooks are unavailable or disabled, call `save` action `checkpoint` manually before compaction, ending a session, or switching to a different task.

## Claude Usage Notes

- Keep tool use tight. Claude tends to over-explore unless instructed otherwise.
- Prefer one `rg` search and a few targeted reads over broad repo scans.
- Prefer `pnpm test:stable` before `pnpm test` unless the change genuinely needs the full suite.
