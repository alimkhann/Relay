# Relay MCP

Relay MCP exposes Relay project context to MCP-compatible coding tools.

## Install

```bash
npx @onrelay/wizard
```

Relay defaults to local stdio installs. The wizard writes each client's native
config format instead of forcing a generic shared JSON file.

For manual local MCP config, point your client at:

```bash
npx -y @onrelay/mcp
```

The `relay-mcp` binary reads Relay credentials from `~/.relay/mcp.json` or `RELAY_API_TOKEN`.

## Claude Code hooks

Relay can install Claude Code autosave hooks into `~/.claude/settings.json` so
`relay-flush` runs on `PreCompact`, `SessionEnd`, and `Stop`.

## Troubleshooting

- If Relay MCP keeps opening the wrong project, remove the pinned `projectId` from `~/.relay/mcp.json` and restart your MCP client so project auto-detection can run again.
- You can always force a specific project by setting `RELAY_PROJECT_ID` in the client environment.

## Publish

```bash
pnpm release:mcp:dry-run
pnpm release:mcp
```
