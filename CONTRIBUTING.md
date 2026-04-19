# Contributing

Relay is in a launch-stage hardening phase. Prefer small, reviewable changes.

## Before Opening A PR

1. Run `pnpm repo:check`
2. Run `pnpm lint`
3. Run `pnpm typecheck`
4. Run `pnpm test:stable`
5. Run the smallest targeted tests for the files you changed
6. If you changed publishable packages, run `pnpm release:dry-run`

## PR Expectations

- One coherent change per PR
- Clear user-facing summary
- Rollback note for risky changes
- Explicit package publish impact when `@onrelay/wizard`, `@onrelay/cli`, or `@onrelay/mcp` changed
- Config or migration impact called out clearly

## Branch And Merge Policy

- `main` should be protected
- PR review required before merge
- Required checks should include the fast CI workflow
- No force-pushes to `main`
- No direct pushes to `main`

## Repo Hygiene

- Keep root markdown limited to the canonical whitelist in `AGENTS.md`
- Put non-canonical docs in `docs/agents/`, `docs/internal/`, or a feature-specific docs/research folder
- Do not add private artifacts to the repo root
- Do not commit local env files or secret-bearing files
- Do not commit local client state from `.claude/`, `.opencode/`, or similar tool-specific directories
- Do not commit generated caches, `__pycache__`, `*.pyc`, packaged bundles, reviewer mail, or pitch decks
- Do not create ad hoc documentation files in the root unless they are repo-wide policy or release docs
- Do not touch `apps/extension` unless the task explicitly requires it
