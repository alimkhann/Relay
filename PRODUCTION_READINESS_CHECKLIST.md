# Relay Production Readiness Checklist

Last updated: 2026-03-20

## Highest Priority

- [x] Default auto-capture to off for newly created users and gate it behind a one-time post-onboarding prompt.
- [x] Show the yellow auto-capture warning in both the dashboard workspace shell and extension after first project setup.
- [x] Stop persisting plaintext Google OAuth tokens in `google-auth-service` fallback account linking.
- [ ] Encrypt all sensitive user content in the database at the application layer.
- [ ] Replace long-lived extension/CLI bearer handling with shorter-lived scoped credentials and safer local storage.

## CLI Release

- [x] Add `README`, `repository`, `homepage`, `bugs`, `license`, and `publishConfig` metadata to `packages/cli/package.json`.
- [x] Add an npm publish workflow and versioning/release process.
- [x] Add a browserless/manual authentication fallback for server environments.
- [x] Add install and troubleshooting docs for macOS/Linux/Windows.

## MCP On Vercel

- [ ] Keep `@onrelay/mcp` as the local stdio package.
- [ ] Build a remote HTTP MCP endpoint in the web app (for example `/api/mcp`) using streamable HTTP transport.
- [ ] Protect the remote MCP surface with scoped bearer auth and project scoping.
- [ ] Add remote MCP docs for Claude Code, Cursor, Windsurf, Codex, and Gemini.

## Security Hardening

- [ ] Move extension auth storage away from long-lived plaintext `chrome.storage.local` where feasible.
- [x] Remove raw token persistence from CLI auth sessions.
- [ ] Move browser handoff tokens out of URL query strings.
- [ ] Add auth/token issuance and revocation tests.
- [ ] Review extension permission scope and tighten host permissions before store submission.

## Compliance And Docs

- [x] Update privacy and terms to exactly match shipped behavior.
- [x] Implement or remove the claimed export flow.
- [x] Implement analytics opt-out behavior or remove the Do Not Track claim.
- [x] Refresh MCP docs to match current MCP tool names.
- [ ] Prepare Chrome Web Store reviewer notes and data-use disclosures.

## Operations

- [x] Add CI for lint, typecheck, tests, and production build.
- [x] Add deployment documentation and environment validation for Vercel.
- [x] Define how internal drain jobs run in production.
- [x] Add structured production logging, alerting, and health checks.
- [ ] Expand E2E coverage for auth, billing, onboarding, extension pairing, and MCP auth.
