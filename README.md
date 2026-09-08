<div align="center">

# Relay

One memory sidecar for every AI tool you use.

[Live site](https://onrelay.app) · [Watch the demo](https://youtu.be/15aqzManX-0) · [Report a bug](https://github.com/alimkhann/Relay/issues) · [Request a feature](https://github.com/alimkhann/Relay/issues)

</div>

## Demo

Fifty seconds, no slides. How capture, briefs, and injection actually work.
Plays right here. Full version on [YouTube](https://youtu.be/15aqzManX-0).

<video src="https://github.com/alimkhann/Relay/raw/main/docs/demo.mp4" controls="controls" muted="muted" preload="metadata"></video>

## About

I kept re-explaining my project every time I switched AI tabs. Each tool remembered nothing about the others. Relay fixes that with a small memory sidecar that lives in the browser and hands each tool the context it needs.

How it works: per-site adapters read the page you are on, the extension builds a tight context packet for the target tool, and everything stays reviewable in the dashboard. You see what gets stored and what gets sent. Nothing syncs silently.

The part I was careful about: handing private context to the wrong tool. So adapters work against a narrow validated schema, storage goes through explicit repositories, and raw page content never leaves the machine unshaped.

Contents:

- `apps/web` — landing page, dashboard, and API routes
- `apps/extension` — Chrome MV3 extension
- `packages/shared` — types, schemas, constants, utilities
- `packages/db` — storage abstractions, migrations, repositories
- `packages/adapters` — per-site DOM adapters for supported AI tools
- `packages/formatters` — context packet formatters per target tool
- `packages/cli`, `packages/cli-core`, `packages/wizard`, `packages/mcp` — terminal and agent integrations

## Built with

- [Next.js](https://nextjs.org) (App Router) for the web app and API routes
- [Plasmo](https://www.plasmo.com) for the Chrome MV3 extension
- [Postgres](https://www.postgresql.org) (Neon-compatible) for storage
- [Tailwind CSS](https://tailwindcss.com) plus shadcn-style primitives for UI
- [Vitest](https://vitest.dev) and [Playwright](https://playwright.dev) for tests

## Getting started

To get a local copy running, follow these steps.

### Prerequisites

- Node 20+
- [pnpm](https://pnpm.io) 9+
- Postgres running locally, or a Neon branch

### Installation

1. Clone the repo

   ```sh
   git clone https://github.com/alimkhann/Relay.git
   cd Relay
   ```

2. Install dependencies

   ```sh
   pnpm install
   ```

3. Copy the example env file and fill in your own values

   ```sh
   cp .env.example .env
   ```

4. Start the web app and the extension dev build

   ```sh
   pnpm dev:web
   pnpm dev:extension
   ```

### Local DB and local auth

If you want to run fully offline, set `AUTH_PROVIDER=local` and `PLASMO_PUBLIC_RELAY_AUTH_PROVIDER=local` in your env, then:

```sh
pnpm db:local:start
pnpm db:local:migrate
pnpm db:local:seed:user -- --email local@relay.test --name "Relay Local"
pnpm dev:web
pnpm dev:extension
```

Reset helpers: `pnpm db:local:count` shows row counts, `pnpm db:local:reset` wipes local data.

## Usage

Load the extension from the Plasmo dev build into Chrome, sign in, and open any supported AI tool. Relay picks up the page context and offers it back as a packet shaped for that tool. The dashboard shows stored memory and what was sent where.

One gotcha that cost me an afternoon: extension Google sign-in ties the redirect URI to the extension ID. If you share unsigned test builds, each install gets a different ID and Google rejects the login with `redirect_uri_mismatch`. Fix it by pinning `CRX_PUBLIC_KEY` so the ID stays stable, then add `https://<your-extension-id>.chromiumapp.org/` to the OAuth client's authorized redirect URIs.

## Roadmap

- More site adapters for the AI tools people actually use daily
- More formatter targets so packets fit each tool's context window well
- Extension store release once auth and sync are boring
- CLI and MCP surface kept in sync with the web contract

Open issues hold the full list. Suggestions welcome.

## Contributing

Small, reviewable changes beat big refactors here. If you touch a client integration surface, update the registry, docs, and tests in the same change. See `CONTRIBUTING.md` for the full guide.

1. Fork the repo
2. Create a branch (`git checkout -b feature/thing`)
3. Commit your change
4. Push and open a pull request

## License

Copyright (c) Relay. All rights reserved. See `LICENSE` for details.

## Contact

Alimkhan Yergebayev — alimkhan.yergebayev@gmail.com

Project link: [https://github.com/alimkhann/Relay](https://github.com/alimkhann/Relay)

## Acknowledgments

- Plasmo docs for making MV3 development almost pleasant
- The shadcn/ui project for primitives worth borrowing
