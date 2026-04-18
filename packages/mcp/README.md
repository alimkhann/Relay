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

## Hook-capable clients

Relay installs extra client setup only where the client has an official hook surface.

- Claude Code: `PreCompact`, `SessionEnd`, `Stop`, `StopFailure`
- Gemini CLI: `PreCompress`, `SessionEnd`, `AfterAgent`
- Windsurf: `post_cascade_response_with_transcript`, `post_mcp_tool_use`

Relay does not promise a universal pre-rate-limit save hook. The fallback model
is best-effort pre-loss protection: native hooks where supported, opportunistic
server sweeps, and explicit checkpoints for hookless clients.

## Troubleshooting

- If Relay MCP keeps opening the wrong project, remove the pinned `projectId` from `~/.relay/mcp.json` and restart your MCP client so project auto-detection can run again.
- You can always force a specific project by setting `RELAY_PROJECT_ID` in the client environment.

## Publish

```bash
pnpm release:dry-run
pnpm release:mcp
```
