# Relay Client Setup Matrix

This directory is for agent-specific reference material that should not live in the repo root.

Use the shared registry in `packages/shared/src/constants/mcp-clients.ts` as the source of truth. Keep this document short and descriptive rather than duplicating the full registry.

## Canonical root instruction files

- `AGENTS.md`: shared repo policy
- `CLAUDE.md`: Claude-specific overlay
- `GEMINI.md`: Gemini-specific overlay

## Repo-owned overlays outside root

- `.github/copilot-instructions.md`
- `.cursor/rules/relay.mdc`
- `.windsurf/rules/relay.md`

## What does not belong in git

- `.claude/`
- `.opencode/`
- machine-local MCP config
- local plans, caches, and generated client state

## When updating client support

Update these together:

- `packages/shared/src/constants/mcp-clients.ts`
- installer behavior in `packages/cli-core/src/`
- user-facing docs in `apps/web` and package READMEs
- tests covering install and validation behavior
