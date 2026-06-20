# relay-sync-worker

Cloudflare Worker that offloads `GET /api/extension/bindings` (the extension's
per-tab poll, top Active-CPU consumer) from Vercel. Proxies every other method/
path straight back to Vercel, so nothing else changes.

- **Why:** Vercel Hobby caps Active CPU at 4 CPU-hrs/month (per account). This
  endpoint dominated it. See `../RUNBOOK.md`.
- **Self-contained:** deliberately outside the pnpm workspace (own `package.json`,
  own install) so it can never touch the web app's lockfile or Vercel build.
- **Faithful port of:** auth (`apps/web/src/server/policies/viewer.ts`), resolve
  (`packages/db/src/repositories/binding-repository.ts`), response shape
  (`apps/web/src/server/services/binding-service.ts`).

Deploy / route / rollback steps: see **`../RUNBOOK.md` → Part A**.

```bash
npm install
npx wrangler login
npx wrangler secret put DATABASE_URL   # Neon connection string
npm run typecheck
npm run deploy
```
