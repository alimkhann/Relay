# Relay CLI

Relay CLI installs and authenticates Relay MCP for local coding tools.

## Install

```bash
npm install -g @relay/cli
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
```

## Browserless auth

If you are on SSH, inside a remote dev box, or on a machine without a GUI, use:

```bash
relay auth login --no-browser
```

Relay prints the approval URL and session code so you can open it manually on another device.

## Supported setup flow

- Detects supported MCP client config locations
- Writes Relay MCP config into local tooling config files
- Installs the Relay skill file for supported agents
- Saves Relay auth in `~/.relay/mcp.json`

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

GitHub Actions also includes a manual CLI publish workflow at `.github/workflows/publish-cli.yml`.
