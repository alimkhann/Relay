# Relay

Relay is a browser-first cross-AI memory sidecar. This repository contains the MVP baseline:

- `apps/web`: public landing page, authenticated dashboard, and backend API routes
- `apps/extension`: Chrome MV3 extension built with Plasmo
- `packages/shared`: shared types, Zod schemas, constants, and utilities
- `packages/db`: storage abstractions, migrations, repositories, and query helpers
- `packages/adapters`: per-site DOM adapters for supported AI tools
- `packages/formatters`: target-specific context packet formatters

## Quick Start

```bash
pnpm install
pnpm dev:web
pnpm dev:extension
```

## Local DB + Local Auth

Set `AUTH_PROVIDER=local` and `PLASMO_PUBLIC_RELAY_AUTH_PROVIDER=local` in your local env, then use the local Postgres flow:

```bash
pnpm db:local:start
pnpm db:local:migrate
pnpm db:local:seed:user -- --email local@relay.test --name "Relay Local"
pnpm dev:web
pnpm dev:extension
```

Useful reset commands:

```bash
pnpm db:local:count
pnpm db:local:reset
```

## Extension Google Auth

Relay's extension sign-in uses `chrome.identity.launchWebAuthFlow()`. Google only accepts the exact redirect URI returned by `chrome.identity.getRedirectURL()`, which is tied to the extension ID.

For any shared, zipped, or production build:

1. Set `CRX_PUBLIC_KEY` for the extension build so the extension ID stays stable.
2. Set `PLASMO_PUBLIC_CRX_GOOGLE_CLIENT_ID` to the Google OAuth client used by the extension.
3. In Google Cloud Console, add the exact redirect URI for that extension ID to the OAuth client's authorized redirect URIs:

```text
https://<your-extension-id>.chromiumapp.org/
```

If you distribute unsigned test builds without a fixed `CRX_PUBLIC_KEY`, each install can get a different extension ID and Google sign-in will fail with `Error 400: redirect_uri_mismatch`.

## Tooling

- Next.js App Router
- Neon-compatible Postgres storage
- Tailwind CSS
- shadcn/ui-style primitives
- Vitest
- Playwright

## Why this exists

AI tools each keep their own memory. I got tired of re-explaining my project every time I switched tabs. Relay keeps one memory sidecar in the browser and hands each tool the context it needs.

## How it works

Input: you work across AI tools in Chrome. Per-site adapters read the page DOM and the extension builds a context packet for the target tool.

Human control: memory stays local-first and reviewable in the dashboard. Nothing syncs silently. You see what gets stored and what gets sent.

Risk I designed around: leaking private context into the wrong tool. The guardrails are per-site adapters with a narrow schema (Zod), storage abstractions with explicit repositories, and no raw DOM exfil.
