# Relay MCP

Relay MCP exposes Relay project context to MCP-compatible coding tools.

## Install

```bash
npx @onrelay/wizard
```

Relay defaults to local stdio installs. The wizard writes each client's native
config format instead of forcing a generic shared JSON file, and it auto-installs
client-native instructions, rules, hooks, or skills where those surfaces are
officially supported.

For manual local MCP config, point your client at:

```bash
npx -y -p @onrelay/mcp relay-mcp
```

The `relay-mcp` binary reads Relay credentials from `~/.relay/mcp.json` or `RELAY_API_TOKEN`.

## Hook-capable clients

Relay installs extra client setup only where the client has an official hook surface.

- Claude Code: `PreCompact`, `SessionEnd`, `Stop`, `StopFailure`
- Gemini CLI: `PreCompress`, `SessionEnd`, `AfterAgent`

Relay does not promise a universal pre-rate-limit save hook. The fallback model
is best-effort pre-loss protection: native hooks where supported, opportunistic
server sweeps, and explicit checkpoints for hookless clients.

## Explainability tools

Relay now exposes a small explainability layer in MCP so coding agents can
inspect and repair continuity instead of treating project memory as a black box:

- `list_memory` / `get_memory`
- `list_sessions` / `archive_session`
- `list_briefs` / `regenerate_brief` / `delete_brief`
- `trace_context_sources`
- `list_recent_activity`

These complement the core resume and writeback tools rather than replacing them.

## Behavior bridges

Relay also installs behavior guidance by client so agents use Relay cheaply and
autonomously:

- Claude Code: managed `CLAUDE.md` block + hooks
- Codex: managed user `AGENTS.md` block
- Cursor: `.cursor/rules/relay.mdc`
- Windsurf: `.windsurf/rules/relay.md`
- Gemini CLI: managed `GEMINI.md` block + hooks
- OpenCode: managed `instructions` entries + project skill
- VS Code / Copilot: managed `.github/copilot-instructions.md` block

The default agent flow is:

- start or resume with `get_brief`
- only call `list_projects` and `set_current_project` if Relay reports ambiguity
- search before high-impact decisions when local context is incomplete
- save only at meaningful boundaries or for clearly confirmed durable facts

## Troubleshooting

- If Relay MCP keeps opening the wrong project, remove the pinned `projectId` from `~/.relay/mcp.json` and restart your MCP client so project auto-detection can run again.
- You can always force a specific project by setting `RELAY_PROJECT_ID` in the client environment.

## Publish

```bash
pnpm release:dry-run
pnpm release:mcp
```
