# Relay Production Readiness Checklist

Last updated: 2026-03-28

## Highest Priority

- [x] Default auto-capture to off for newly created users and gate it behind a one-time post-onboarding prompt.
- [x] Show the yellow auto-capture warning in both the dashboard workspace shell and extension after first project setup.
- [x] Stop persisting plaintext Google OAuth tokens in `google-auth-service` fallback account linking.
- [ ] Encrypt all sensitive user content in the database at the application layer.
- [ ] Replace long-lived extension/CLI bearer handling with shorter-lived scoped credentials and safer local storage.
- [x] Make public pricing and plan copy match shipped limits and behavior.
- [x] Add minimal analytics consent before enabling PostHog cookies in the web app.
- [x] Preserve Pro access during `past_due` billing state while directing users to fix billing.

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
- [x] Review extension permission scope and tighten host permissions before store submission.

## Compliance And Docs

- [x] Update privacy and terms to exactly match shipped behavior.
- [x] Implement or remove the claimed export flow.
- [x] Implement analytics opt-out behavior or remove the Do Not Track claim.
- [x] Refresh MCP docs to match current MCP tool names.
- [x] Prepare Chrome Web Store reviewer notes and data-use disclosures.
- [ ] Finish Chrome Web Store screenshots and promotional tile.
- [ ] Fill the Chrome Web Store dashboard privacy/data-use questionnaire using the prepared notes.

## Operations

- [x] Add CI for lint, typecheck, tests, and production build.
- [x] Add deployment documentation and environment validation for Vercel.
- [x] Define how internal drain jobs run in production.
- [x] Add structured production logging, alerting, and health checks.
- [x] Add live `robots.txt` and `sitemap.xml` routes and deploy them.
- [ ] Expand E2E coverage for auth, billing, onboarding, extension pairing, and MCP auth.

## SEO And Discoverability

- [ ] Verify `onrelay.app` in Google Search Console and submit `https://onrelay.app/sitemap.xml`.
- [ ] Import the property into Bing Webmaster Tools and submit the same sitemap.
- [ ] Check live OG/Twitter previews once more before launch after the final marketing copy settles.

## Email And Retention

- [x] Refresh welcome and trial email copy so it matches Relay's current positioning.
- [ ] Redesign transactional email templates more fully for launch polish.
- [ ] Implement the first lifecycle sequence (recommended: welcome follow-up + 7-day inactivity email).

## Launch Operations

- [ ] Prepare Product Hunt listing assets and first-comment copy.
- [ ] Decide whether to keep launch support lightweight (email only) or add an external status page and feature board.
- [ ] Resolve Relay MCP project-selection/memory cleanup issue so project context points at Relay instead of the stale Launchy project.
