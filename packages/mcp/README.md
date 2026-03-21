# Relay MCP

Relay MCP exposes Relay project context to MCP-compatible coding tools.

## Install

```bash
npx @onrelay/wizard
```

For manual MCP config, point your client at:

```bash
npx -y @onrelay/mcp
```

The `relay-mcp` binary reads Relay credentials from `~/.relay/mcp.json` or `RELAY_API_TOKEN`.

## Publish

```bash
pnpm release:mcp:dry-run
pnpm release:mcp
```
