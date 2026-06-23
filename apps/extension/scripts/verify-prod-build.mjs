// Guards the production extension build against a misconfigured API origin.
//
// The shipped 0.6.0 baked `http://localhost:3000` into the manifest because a
// stray `.env.prod.local` (PLASMO_PUBLIC_RELAY_API_BASE=http://localhost:3000,
// AUTH_PROVIDER=local) outranked `.env.production` under `plasmo build --tag prod`.
// In prod the extension then fetched localhost and Google sign-in died with
// "Failed to fetch". This check fails the build before such a bundle can ship.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const PROD_ORIGIN = "https://www.onrelay.app"

const here = dirname(fileURLToPath(import.meta.url))
const manifestPath = resolve(here, "..", "build", "chrome-mv3-prod", "manifest.json")

let raw
try {
  raw = readFileSync(manifestPath, "utf8")
} catch {
  console.error(`[verify-prod-build] cannot read ${manifestPath} — run \`plasmo build --tag prod\` first.`)
  process.exit(1)
}

const problems = []
if (raw.includes("localhost")) {
  problems.push(`manifest contains "localhost" — prod build picked up a dev/local env (stray .env.prod.local or wrong --tag).`)
}
if (raw.includes("$PLASMO_PUBLIC_")) {
  problems.push(`manifest contains unresolved PLASMO_PUBLIC placeholders — prod build did not receive required public env values.`)
}
if (!raw.includes(PROD_ORIGIN)) {
  problems.push(`manifest is missing "${PROD_ORIGIN}" — PLASMO_PUBLIC_RELAY_API_BASE was not the prod origin at build time.`)
}

if (problems.length > 0) {
  console.error("[verify-prod-build] FAILED — refusing to package a misconfigured extension:")
  for (const p of problems) console.error(`  - ${p}`)
  console.error("Check apps/extension/.env.production and remove any .env.prod.local / .env.local overrides, then rebuild.")
  process.exit(1)
}

console.log(`[verify-prod-build] OK — manifest targets ${PROD_ORIGIN}, no localhost.`)
