import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { chromium } from "playwright"

async function main() {
  const targetUrl = process.argv[2] || "https://eu.posthog.com"
  const profileDir = path.join(os.tmpdir(), "relay-posthog-playwright-profile")

  fs.mkdirSync(profileDir, { recursive: true })

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 960 },
  })

  const page = context.pages()[0] ?? await context.newPage()
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" })

  console.log(`Playwright opened ${targetUrl}`)
  console.log("Leave this process running while you sign in.")

  context.on("close", () => {
    process.exit(0)
  })

  await new Promise(() => {})
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
