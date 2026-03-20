# Relay Deployment

## Production host

- Vercel project: `relay`
- Production domain: `https://www.onrelay.app`

## Before deploy

```bash
pnpm install
pnpm validate:env
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Deploy to Vercel

```bash
vercel deploy --prod --yes
```

If the repo is not linked locally, log in with `vercel whoami` first and confirm the target project is `relay`.

## Required production environment variables

- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `NEXT_PUBLIC_RELAY_APP_URL`
- `RELAY_INTERNAL_API_SECRET`
- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PRODUCT_ID_PRO_MONTHLY`
- `POLAR_PRODUCT_ID_PRO_ANNUAL`

Neon auth mode also requires:

- `NEON_AUTH_BASE_URL`
- `NEXT_PUBLIC_NEON_AUTH_URL`
- `NEON_AUTH_COOKIE_SECRET`

Local auth mode instead requires:

- `LOCAL_AUTH_SESSION_SECRET`

## Important note on app URLs

Some current auth/token flows still read `NEXT_PUBLIC_APP_URL` while most of the app reads `NEXT_PUBLIC_RELAY_APP_URL`.
Set both to the same production origin until the legacy name is fully removed.

## Internal drain job

Relay currently exposes `POST /api/internal/jobs/drain` for digest draining.
Production still needs a scheduler to invoke it with `RELAY_INTERNAL_API_SECRET`.

Recommended options:

- Vercel Cron calling a small internal route wrapper
- GitHub Actions scheduled workflow with a protected secret
- External scheduler hitting the endpoint over HTTPS
