# Relay CLI

Relay CLI installs and authenticates Relay MCP for local coding tools.

## Install

```bash
npm install -g @onrelay/cli
relay install
```

## Commands

```bash
relay install [--api-base URL] [--no-browser]
relay auth login [--api-base URL] [--no-browser]
relay auth logout
relay auth status
relay brief [projectId] [--profile KEY] [--kind fresh_chat_bootstrap|quick_continuity]
relay status [projectId]
relay projects list
relay projects switch <project-id-or-slug>
relay uninstall
```

## Browserless auth

If you are on SSH, inside a remote dev box, or on a machine without a GUI, use:

```bash
relay auth login --no-browser
```

Relay prints the approval URL and session code so you can open it manually on another device.

## Supported setup flow

- Detects supported MCP client config locations
- Writes Relay MCP config using each client's native config format
- Installs client setup only where the client exposes an official support surface
- Adds Claude Code, Gemini CLI, and Windsurf hooks where supported
- Saves Relay auth in `~/.relay/mcp.json`

## Uninstall

```bash
relay uninstall
```

This removes the `relay` MCP entry from detected tool config files, removes client-specific Relay setup where installed, and clears local CLI credentials.

## Troubleshooting

- macOS/Linux: make sure your global npm bin path is on `PATH`
- Windows: restart the shell after global install if `relay` is not found
- Remote shells / CI: use `--no-browser`
- Custom Relay host: use `--api-base https://your-relay-host`

## Release

Local dry run:

```bash
pnpm release:cli:dry-run
```

Publish:

```bash
pnpm release:cli
```

If you publish manually, run `pnpm release:dry-run` first and bump the package version intentionally.
