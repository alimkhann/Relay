import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { chromium, expect, test } from "@playwright/test"

// Runtime net for the background service-worker refactor (Phase 2). Loads the
// PRE-BUILT prod extension (run `pnpm --filter @relay/extension build` first —
// the in-test Plasmo rebuild is racy), then drives `chrome.runtime.sendMessage`
// against the SW and asserts each message type returns a well-formed response.
// This proves the `onMessage` `return true` port contract + the refactored
// session-cache/dispatch path survive module extraction.
const extensionPath = path.join(process.cwd(), "apps/extension/build/chrome-mv3-prod")

const SESSION_PAYLOAD = {
  userId: "user-1",
  projects: [
    { id: "personal-1", name: "Personal", kind: "personal", memoryCount: 0, sessionCount: 0 },
    { id: "project-1", name: "Project Alpha", kind: "project", memoryCount: 3, sessionCount: 2 },
  ],
  settings: { settings: { autoCapture: true, defaultTargetProfileKey: "chatgpt_planning" } },
  onboarding: { status: "completed", completedProjectId: "project-1", completedVia: "web", completedAt: "2026-03-12T00:00:00.000Z" },
  features: { multiProjectCapture: false },
  entitlements: { plan: "free", status: "active" },
}

test.describe("Relay background SW message dispatch", () => {
  test.beforeAll(() => {
    if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
      throw new Error(
        `Built extension not found at ${extensionPath}. Run \`pnpm --filter @relay/extension build\` before this spec.`,
      )
    }
  })

  test("dispatches core SW messages and refreshes the session through the refactored cache", async () => {
    test.setTimeout(60000)
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-bg-dispatch-"))

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    })

    const swLogs: string[] = []
    try {
      const serviceWorker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
      serviceWorker.on("console", (msg) => swLogs.push(msg.text()))
      const extensionId = serviceWorker.url().split("/")[2]

      await serviceWorker.evaluate(async () => {
        await chrome.storage.local.set({
          "relay.connected": true,
          "relay.apiBase": "http://localhost:3000",
          "relay.authToken": "test-token",
          "relay.projectId": "project-1",
          "relay.assumedProjectId": "project-1",
          "relay.assumedProjectName": "Project Alpha",
        })
      })

      let sessionFetchCount = 0
      await context.route("http://localhost:3000/api/extension/session", async (route) => {
        sessionFetchCount += 1
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(SESSION_PAYLOAD),
        })
      })

      const popup = await context.newPage()
      await popup.goto(`chrome-extension://${extensionId}/sidepanel.html`)

      const send = (message: unknown) =>
        popup.evaluate(
          (msg) => new Promise<any>((resolve) => chrome.runtime.sendMessage(msg, resolve)),
          message,
        )

      // 1. RELAY_REFRESH_SESSION → exercises loadSessionData (session-cache module)
      //    end-to-end through the SW, and proves the async handler's sendResponse
      //    arrives (return-true port stays open).
      const refresh = await send({ type: "RELAY_REFRESH_SESSION", payload: { force: true } })
      expect(refresh.ok).toBe(true)
      expect(refresh.connected).toBe(true)
      expect(refresh.projects.map((p: any) => p.id)).toContain("personal-1")
      expect(refresh.projects.map((p: any) => p.id)).toContain("project-1")
      expect(sessionFetchCount).toBeGreaterThanOrEqual(1)

      // 2. A second forced refresh re-fetches (force bypasses the 30-min cache).
      const refresh2 = await send({ type: "RELAY_REFRESH_SESSION", payload: { force: true } })
      expect(refresh2.ok).toBe(true)
      expect(sessionFetchCount).toBeGreaterThanOrEqual(2)

      // 3. A non-forced refresh is served from the persisted snapshot WITHOUT a
      //    network call: RELAY_REFRESH_SESSION clears the in-memory cache, but
      //    loadSessionData(false) then finds the fresh persisted snapshot (written
      //    by the prior fetches) and returns it. This is the cost-cut durability /
      //    30-min persisted-cache behavior, now living in session-cache.ts —
      //    verified at runtime, not just unit-mocked.
      const before = sessionFetchCount
      const refresh3 = await send({ type: "RELAY_REFRESH_SESSION", payload: {} })
      expect(refresh3.ok).toBe(true)
      expect(refresh3.projects.map((p: any) => p.id)).toContain("project-1")
      expect(sessionFetchCount).toBe(before)

      // 4. RELAY_GET_ACTIVE_PROJECT_STATE with no tab → well-formed empty state
      //    (proves a synchronous-ish dispatch branch returns a structured response).
      const state = await send({ type: "RELAY_GET_ACTIVE_PROJECT_STATE", payload: {} })
      expect(state).toBeTruthy()
      expect(state).toHaveProperty("chatAssociation")
      expect(state).toHaveProperty("projectName")

      // 5. RELAY_LOG_TELEMETRY → fire-and-forget branch still acks.
      const telem = await send({
        type: "RELAY_LOG_TELEMETRY",
        payload: { level: "info", surface: "extension-content", area: "test", event: "e2e_ping", message: "ping" },
      })
      expect(telem?.ok).toBe(true)
    } finally {
      await Promise.race([
        context.close(),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ])
      fs.rmSync(userDataDir, { recursive: true, force: true })
    }
  })
})
