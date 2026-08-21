# Relay × Cloudflare runbook

Two independent Cloudflare options, plus the shared DNS prerequisite. Read the
overview, then jump to the part you need.

## Why this exists

This project is on Vercel's **classic** billing model (Fluid off). The binding cap
is **Function Duration = 100 GB-Hrs/month** (GB-Hrs = memory × wall-clock time,
summed across all functions). As of this writing usage is **107.8 / 100 GB-Hrs —
already over** — so Vercel can pause the project at any time, and reducing usage
will not un-trip it until the monthly reset (1st of the month). That is why the
Cloudflare move below is the real safety net, not just an optimization.

Two levers cut GB-Hrs directly:
- **less memory** per function (linear) — see `apps/web/vercel.json` `functions`
  (commit `aa48551` lowered the extension routes to 512 MB);
- **less wall-clock time** per call — commit `c0bb538` (A1) cut
  `GET /api/extension/bindings` (the extension's per-tab poll, the single biggest
  consumer) from 5×N DB queries to 5.

These slow the bleed and help next month, but once you are over the cap the
durable fix is to move load off Vercel (Parts A/B). Invocations (1M) and any
Active-CPU/Provisioned-Memory figures are not the binding constraint here.

| Option | What it does | Fire when |
|---|---|---|
| **Part A — sync worker** (`cloudflare/sync-worker/`, built & ready) | Moves just `GET /api/extension/bindings` to Cloudflare's free tier. Permanent route-split. | You want durable Active-CPU headroom even after A1. |
| **Part B — full offload (OpenNext)** | Whole Next.js app → Cloudflare Workers. Fresh free compute budget, bypasses a Vercel pause entirely. | Vercel **pauses the project** before the monthly reset and you can't wait. |
| **Part C — DNS to Cloudflare** | Move `onrelay.app` nameservers to Cloudflare. | Prerequisite for the clean version of **both** A and B. |

---

## Part A — Deploy the sync worker (bindings offload)

Code is in `cloudflare/sync-worker/` (self-contained, outside the pnpm workspace,
typechecked). It serves both `GET` and `POST /api/extension/bindings`. The POST
path is owned by the worker because Cloudflare Worker Routes match all methods
for a path, and the available Vercel deployment aliases are either protected or
redirect back to `www.onrelay.app`.

```bash
cd cloudflare/sync-worker
npm install
npx wrangler login

# Secret: Neon connection string (service/pooled role is fine — the binding query
# is already scoped by user_id). Reuse SERVICE_DATABASE_URL or DATABASE_URL.
npx wrangler secret put DATABASE_URL

# VERCEL_ORIGIN is only used for direct workers.dev smoke tests on non-bindings
# paths. Production should route only /api/extension/bindings* to this Worker.

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

If using CLI/API, the Cloudflare credential must be able to create/manage the
`onrelay.app` zone. A Wrangler OAuth token with only `zone:read` can deploy the
Worker but cannot add the site; Cloudflare returns
`Requires permission "com.cloudflare.api.account.zone.create"`.

**Rollback:** delete that Worker Route. Traffic falls back to the Vercel handler
instantly. The Vercel route is never removed.

**Without Part C (DNS not on Cloudflare):** you can only reach the worker at its
`*.workers.dev` URL. To use it you'd point the extension's bindings calls there
via a new env (`PLASMO_PUBLIC_RELAY_SYNC_BASE`) and ship an extension release —
slower, and you must keep the Vercel route as a version-skew fallback. Prefer
Part C.

---

## Part B — Full offload to Cloudflare (the parachute)

Fire this only if Vercel pauses the whole project.

**Status: build validated on branch `chore/opennext-parachute`.**
`npx opennextjs-cloudflare build` completes green there (output `.open-next/worker.js`).
The branch holds everything below so main/live is untouched. To fire it:

```bash
git checkout chore/opennext-parachute
cd apps/web
pnpm install
npx opennextjs-cloudflare build      # already green; re-run to be sure
npx wrangler deploy                  # needs `wrangler login` + secrets (B5)
```

**Caveats before you rely on it:**
- *Build green ≠ runtime-verified.* `pg` / `pdf-parse` / auth / RLS on the real
  Workers runtime are unproven — smoke-test every critical path after deploy.
- *Next version.* 16.1.6 is below OpenNext's official peer range
  (`>=15.5.18 <16 || >=16.2.6`). It builds, but **bump Next to ≥16.2.6** before
  trusting this in production.
- *One code change is already applied on the branch:* `opengraph-image.tsx`
  runtime `edge → nodejs` (OpenNext can't bundle edge functions). It's kept OFF
  main on purpose — edge routes don't bill Vercel GB-Hrs, nodejs ones do.

The remaining subsections (B0–B6) document the why and the env/deploy details.

### B0. Known blockers (fix before/while building)

1. **`pg` top-level import — build OK, runtime unverified.** `packages/db/src/store/provider.ts`
   does `import { Pool as PostgresPool } from "pg"` at module top. The OpenNext
   build **bundles it fine** under `nodejs_compat` (the validated branch did not
   need any patch). The remaining risk is *runtime*: prod only ever uses the Neon
   HTTP driver, so `pg`'s code path is never executed — but if module-load alone
   throws on Workers, make the import lazy so it loads only in local mode:

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
