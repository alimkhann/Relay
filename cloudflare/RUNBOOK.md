# Relay × Cloudflare runbook

Two independent Cloudflare options, plus the shared DNS prerequisite. Read the
overview, then jump to the part you need.

## Why this exists

Vercel Hobby caps **Active CPU at 4 CPU-hrs/month** (per *account*, not project).
`GET /api/extension/bindings` — polled per-tab by the extension — was burning
~20 CPU-min / 12h (≈20+ CPU-hrs/month, 5× the whole cap). Commit `c0bb538` (A1)
cut that endpoint from 5×N DB queries to 5 per call, which should keep you under
the cap on its own. Provisioned Memory (360 GB-hr) and Invocations (1M) are at
~4% and ~22% — not constraints.

| Option | What it does | Fire when |
|---|---|---|
| **Part A — sync worker** (`cloudflare/sync-worker/`, built & ready) | Moves just `GET /api/extension/bindings` to Cloudflare's free tier. Permanent route-split. | You want durable Active-CPU headroom even after A1. |
| **Part B — full offload (OpenNext)** | Whole Next.js app → Cloudflare Workers. Fresh free compute budget, bypasses a Vercel pause entirely. | Vercel **pauses the project** before the monthly reset and you can't wait. |
| **Part C — DNS to Cloudflare** | Move `onrelay.app` nameservers to Cloudflare. | Prerequisite for the clean version of **both** A and B. |

---

## Part A — Deploy the sync worker (bindings offload)

Code is in `cloudflare/sync-worker/` (self-contained, outside the pnpm workspace,
typechecked). It serves `GET /api/extension/bindings` and proxies everything else
back to Vercel.

```bash
cd cloudflare/sync-worker
npm install
npx wrangler login

# Secret: Neon connection string (service/pooled role is fine — the binding query
# is already scoped by user_id). Reuse SERVICE_DATABASE_URL or DATABASE_URL.
npx wrangler secret put DATABASE_URL

# Edit wrangler.toml → set VERCEL_ORIGIN to a Vercel origin NOT behind the CF route
# (the project's *.vercel.app production alias), so the non-GET proxy doesn't loop.

npm run deploy        # → https://relay-sync-worker.<subdomain>.workers.dev
```

**Smoke test** (use a real extension bearer token from a logged-in extension):

```bash
curl -s "https://relay-sync-worker.<subdomain>.workers.dev/api/extension/bindings?tabId=1&domain=chatgpt.com&platform=chatgpt" \
  -H "authorization: Bearer <EXTENSION_TOKEN>" | jq .
# Expect: { "binding": { "binding": {...,"bindingKind":"..."}, "project": {"id","name","slug"} } }
# or      { "binding": null }
```

**Route it (needs Part C done first):** Cloudflare dashboard → your zone →
Workers Routes → add `www.onrelay.app/api/extension/bindings*` → worker
`relay-sync-worker`. The extension keeps calling `https://www.onrelay.app`
(its single `PLASMO_PUBLIC_RELAY_API_BASE`) and never changes.

**Rollback:** delete that Worker Route. Traffic falls back to the Vercel handler
instantly. The Vercel route is never removed.

**Without Part C (DNS not on Cloudflare):** you can only reach the worker at its
`*.workers.dev` URL. To use it you'd point the extension's bindings calls there
via a new env (`PLASMO_PUBLIC_RELAY_SYNC_BASE`) and ship an extension release —
slower, and you must keep the Vercel route as a version-skew fallback. Prefer
Part C.

---

## Part B — Full offload to Cloudflare (the parachute)

Fire this only if Vercel pauses the whole project. Next.js is **16.1.6** →
supported by `@opennextjs/cloudflare` (1.0 GA). Everything below is staged here so
it never touches the live Vercel build until you run it.

### B0. Known blockers (fix before/while building)

1. **`pg` top-level import breaks on Workers.** `packages/db/src/store/provider.ts`
   does `import { Pool as PostgresPool } from "pg"` at module top. `pg` needs TCP
   sockets and crashes the Workers runtime even though prod only uses the Neon
   HTTP driver. **Fix:** make the `pg` import lazy so it loads only in local mode:

   ```ts
   // provider.ts — replace the top-level pg import with a lazy loader.
   // import { Pool as PostgresPool } from "pg"   // ← remove
   type PgPoolCtor = typeof import("pg").Pool
   let pgPoolCtor: PgPoolCtor | undefined
   async function getPgPoolCtor(): Promise<PgPoolCtor> {
     if (!pgPoolCtor) pgPoolCtor = (await import("pg")).Pool
     return pgPoolCtor
   }
   ```

   `getPostgresPool()` (local mode only) and its sync caller in
   `createRepositoryProvider` then need to await the ctor. Because prod/Workers
   never take the local branch, an alternative that avoids the async ripple is to
   mark `pg` external in the OpenNext bundle (see B2 `edgeExternals`) and keep the
   top-level import — test both; the lazy import is the robust default.

2. **`pdf-parse`** (`apps/web/next.config.ts:14`, `serverExternalPackages`) — verify
   it runs under `nodejs_compat`, or gate the PDF ingest path off on Workers.

3. **`node:crypto`** (auth/OTP/webhook HMAC, `timingSafeEqual`/`randomBytes`/
   `createHash`) — covered by `nodejs_compat`; smoke-test after deploy.

4. **Cron** (`apps/web/vercel.json` daily `/api/internal/jobs/cron`) → recreate as a
   Cloudflare Cron Trigger (B3); keep the `CRON_SECRET` bearer check.

### B1. Add deps (in `apps/web`)

```bash
cd apps/web
pnpm add -D @opennextjs/cloudflare wrangler
```

### B2. Create `apps/web/open-next.config.ts`

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare"

export default defineCloudflareConfig({
  // Keep node-only packages out of the edge bundle if they misbehave:
  // edgeExternals: ["pg", "pdf-parse"],
})
```

### B3. Create `apps/web/wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "relay-web",
  "main": ".open-next/worker.js",
  "compatibility_date": "2024-09-23",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "triggers": { "crons": ["0 0 * * *"] } // mirrors the Vercel daily cron
}
```

### B4. Build locally (proves it compiles — do this NOW as a dry run, don't deploy)

```bash
cd apps/web
npx opennextjs-cloudflare build
# Resolve any blocker from B0 until this is green. This step is safe — it does not
# deploy and does not affect Vercel.
```

### B5. Env / secrets parity (when actually deploying)

Set every var the app reads, via `wrangler secret put` / `[vars]`:
`DATABASE_URL`, `WORKER_DATABASE_URL`, `SERVICE_DATABASE_URL`, `CRON_SECRET`,
auth (Neon Auth) keys, Polar billing keys, Telegram bot token, Gemini/Anthropic
keys, and `AUTH_PROVIDER`. Pull the list from the Vercel project's Environment
Variables.

### B6. Deploy + cut over

```bash
cd apps/web
npx opennextjs-cloudflare build && npx wrangler deploy
```

- With **Part C** done: add a Workers route `www.onrelay.app/*` → `relay-web`
  (or set a Custom Domain on the worker). The whole app now serves from Cloudflare.
- **Rollback:** remove the `www.onrelay.app/*` route / custom domain → traffic
  returns to Vercel. Once Vercel resets (1st of month), cut back and keep
  Cloudflare staged.

> Note: full offload moves the **UI too** (OpenNext serves the whole app). The
> "keep frontend on Vercel" arrangement only holds in the non-paused, happy path
> (Part A). A full pause means everything rides Cloudflare until Vercel resets.

---

## Part C — Move `onrelay.app` DNS to Cloudflare

Today `onrelay.app` nameservers are at **Namecheap** (`registrar-servers.com`) and
`www` points to Vercel. Cloudflare Worker Routes / custom domains require the zone
on Cloudflare. This is reversible and free.

### What could break (read first)

- **Email**: if you receive mail at `@onrelay.app`, copy the **MX** (and any SPF/
  DKIM/DMARC TXT) records into Cloudflare before switching, or mail stops.
- **Existing records**: Cloudflare auto-imports current records on scan, but
  *verify* every A/CNAME/TXT/MX matches Namecheap before flipping nameservers.
- **Propagation**: nameserver change takes minutes–48h. Keep records identical so
  there's no downtime during propagation.
- **Vercel domain**: keep the Vercel-required record(s) for `www`/apex exactly as
  Vercel specifies, but **proxied (orange cloud)** so Workers can intercept paths.

### Steps

1. Create a free Cloudflare account → **Add a site** → `onrelay.app`.
2. Let Cloudflare scan/import DNS. **Audit the imported records** against your
   current Namecheap zone — especially `www`, apex, and any MX/TXT (email).
3. Ensure `www` (and apex if used) point to Vercel per Vercel's domain settings,
   set to **Proxied (orange cloud)**.
4. Cloudflare shows two nameservers (e.g. `x.ns.cloudflare.com`). In **Namecheap →
   Domain → Nameservers → Custom DNS**, replace with Cloudflare's two.
5. Wait for Cloudflare to show the zone **Active** (email confirmation).
6. Verify the site still loads over `www.onrelay.app` (now via Cloudflare → Vercel).
7. Now Part A's Worker Route (and Part B's custom domain) become available.

### Verify

```bash
dig +short NS onrelay.app        # expect *.ns.cloudflare.com
dig +short www.onrelay.app       # still resolves; site loads normally
```

**Rollback:** set Namecheap nameservers back to `dns1/dns2.registrar-servers.com`.
