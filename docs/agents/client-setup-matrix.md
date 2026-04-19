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

## Wizard behavior

`npx @onrelay/wizard` is the canonical installer. It now does:

- unified browser auth through a single onboarding page
- local stdio MCP install
- client-native behavior setup by default where supported

Current Relay-managed setup by client:

- Claude Code: MCP + `~/.claude/settings.json` hooks + managed `CLAUDE.md` block
- Codex: MCP + managed user `AGENTS.md` block or configured `model_instructions_file`
- Cursor: MCP + `.cursor/rules/relay.mdc`
- Windsurf: MCP + hooks + `.windsurf/rules/relay.md`
- Gemini CLI: MCP + hooks + managed `GEMINI.md` block
- OpenCode: MCP + `instructions` entries + `.agents/instructions/relay.md` + `.agents/skills/relay-context/SKILL.md`
- VS Code / Copilot: MCP + managed `.github/copilot-instructions.md` block
- Claude Desktop: MCP only
- Warp: MCP only for now
- Antigravity: experimental MCP only

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
