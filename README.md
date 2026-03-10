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

## Tooling

- Next.js App Router
- Supabase Auth/Postgres
- Tailwind CSS
- shadcn/ui-style primitives
- Vitest
- Playwright
