# Releasing

## Fast Release Gate

Required before merge or publish:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test:stable`
4. `pnpm build && pnpm build:cli && pnpm build:mcp && pnpm build:wizard`

## Package Rules

- Republish `@onrelay/wizard` when installer behavior changes.
- Republish `@onrelay/cli` when CLI install or uninstall behavior changes.
- Republish `@onrelay/mcp` when MCP runtime behavior or shipped MCP docs/examples materially change.
- Review `smithery.yaml` only when the hosted MCP contract or install metadata changes.

## Release Dry Run

- Run `pnpm release:dry-run` before actual publishes.

## GitHub Settings To Enforce

- Protect `main`
- Require pull requests
- Require the fast CI job to pass
- Block force-pushes
- Block direct pushes
