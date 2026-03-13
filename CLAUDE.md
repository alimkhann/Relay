# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Relay is a browser-first cross-AI memory sidecar that keeps project context synchronized between ChatGPT, Claude, and Perplexity. It's a pnpm monorepo with a Next.js web app, a Chrome MV3 extension, and shared packages.

## Commands

```bash
pnpm dev:web              # Start Next.js dev server (port 3000)
pnpm dev:extension        # Start Plasmo extension dev server
pnpm build                # Build all packages in dependency order
pnpm build:extension:prod # Production extension build
pnpm lint                 # ESLint across all packages
pnpm typecheck            # TypeScript checking across all packages
pnpm test                 # Run Vitest (unit/integration)
pnpm test:watch           # Vitest in watch mode
pnpm test:e2e             # Run Playwright E2E tests
```

Run a single test file: `npx vitest run path/to/file.test.ts`

## Monorepo Structure

```
apps/web/          → Next.js 16 App Router (public pages, dashboard, API routes)
apps/extension/    → Chrome MV3 extension (Plasmo framework)
packages/shared/   → Types, Zod schemas, constants, utilities
packages/db/       → Neon Postgres client, repositories, query helpers
packages/adapters/ → Per-site DOM adapters (ChatGPT, Claude, Perplexity)
packages/formatters/ → Target-specific context packet formatters
```

Cross-package imports use `@relay/shared`, `@relay/db`, `@relay/adapters`, `@relay/formatters`. Within the web app, `@/*` maps to `apps/web/src/*`.

## Architecture

### Database Layer (`packages/db`)
- **Neon Serverless Postgres** with connection pooling (max 4)
- **Row-Level Security**: `relay.current_user_id` is set per-query via `set_config()` — repositories don't check permissions, the DB enforces them
- **Repository pattern**: One class per entity in `packages/db/src/repositories/`, each takes a `DatabaseProvider`
- **Repository bundle**: `createRepositoryBundle(viewerUserId?)` instantiates all repositories with a shared provider
- Database row types live in `packages/shared/src/types/database.ts`

### Auth
- **Neon Auth** (`@neondatabase/auth`) — not Supabase (README is outdated)
- Server: `apps/web/src/lib/auth/server.ts` — `requireAuthServer()` for protected routes
- Client: `apps/web/src/lib/auth/client.ts` — `createAuthClient()`
- Auth sync service (`apps/web/src/server/services/auth-sync-service.ts`) reconciles profiles on login

### API Routes (`apps/web/src/app/api/`)
- Wrapped with `withApiRoute()` or `withApiAuth()` from `@/server/http/api-route.ts`
- The wrapper handles logging, request context, error formatting, and `x-relay-request-id` headers
- Zod validation errors are caught automatically and returned as 400s
- Viewer resolution via `@/server/policies/viewer.ts`

### Extension (`apps/extension`)
- Plasmo framework, Manifest V3
- Background service worker with messaging, storage, and state management
- Content scripts inject into ChatGPT, Claude, Perplexity, and Codex pages
- Side panel UI for extension interaction

### Adapters & Formatters
- **Adapters** (`packages/adapters`): Extract conversations from AI tool DOMs via per-site adapters with a shared base class and registry
- **Formatters** (`packages/formatters`): Convert memory/project state into AI-ready context packets, also registry-based

## Code Conventions

- **Type imports**: Always use `import type` — ESLint enforces `consistent-type-imports`
- **No floating promises**: ESLint enforces `no-floating-promises` — always `await` or handle
- **No unused imports**: Auto-enforced by `unused-imports` plugin
- **File naming**: kebab-case everywhere (e.g., `auth-sync-service.ts`)
- **Class naming**: PascalCase for repositories, services, mappers
- **Tailwind classes**: Use `cn()` helper from `@/lib/cn.ts` (clsx + tailwind-merge)
- **Validation**: Zod schemas live in `packages/shared/src/schemas/`, call `.parse()` at API boundaries

## Testing

- **Unit/integration**: Vitest with jsdom environment, globals enabled
- **Test file pattern**: `*.test.ts` / `*.test.tsx` colocated in `src/` directories
- **E2E**: Playwright (Chromium only), tests in `tests/e2e/`, auto-starts dev server
- **Web app alias**: `@` resolves to `apps/web/src` in test config

## Environment Variables

Key vars (see `.env.example`):
- `DATABASE_URL` — Neon pooled connection string
- `DATABASE_URL_UNPOOLED` — For migrations
- `NEON_AUTH_BASE_URL` / `NEXT_PUBLIC_NEON_AUTH_URL` — Neon Auth endpoints
- `NEON_AUTH_COOKIE_SECRET` — Session encryption
- `PLASMO_PUBLIC_RELAY_API_BASE` — Extension API base URL
