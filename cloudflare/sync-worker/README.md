# relay-sync-worker

Cloudflare Worker that offloads `/api/extension/bindings` (the extension's
per-tab binding read, top Active-CPU consumer) from Vercel. It owns both `GET`
and `POST` for that route so binding reads and writes keep working after a
Cloudflare Worker Route catches all methods for the path.

- **Why:** Vercel Hobby caps Active CPU at 4 CPU-hrs/month (per account). This
  endpoint dominated it. See `../RUNBOOK.md`.
- **Self-contained:** deliberately outside the pnpm workspace (own `package.json`,
  own install) so it can never touch the web app's lockfile or Vercel build.
- **Faithful port of:** auth (`apps/web/src/server/policies/viewer.ts`), binding
  read/write semantics (`packages/db/src/repositories/binding-repository.ts`),
  and the extension-read response shape
  (`apps/web/src/server/services/binding-service.ts`).

Deploy / route / rollback steps: see **`../RUNBOOK.md` → Part A**.

```bash
npm install
npx wrangler login
npx wrangler secret put DATABASE_URL   # Neon connection string
npm run typecheck
npm run deploy
```
