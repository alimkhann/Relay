import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execSync } from "node:child_process"

import { chromium, expect, test } from "@playwright/test"

const extensionPath = path.join(process.cwd(), "apps/extension/build/chrome-mv3-prod")
const fixturePath = path.join(process.cwd(), "tests/e2e/fixtures/chatgpt-fresh.html")

test.describe("Relay inline chip", () => {
  test("shows the chip on a fresh chat, allows switching projects, and inserts immediately", async () => {
    test.setTimeout(60000)

    execSync("pnpm --filter @relay/extension build", {
      cwd: process.cwd(),
      stdio: "pipe"
    })

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-extension-"))
    const fixtureHtml = fs.readFileSync(fixturePath, "utf8")
    let selectedProjectId = "project-1"

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    })

    try {
      const serviceWorker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))

      await serviceWorker.evaluate(async () => {
        await chrome.storage.local.set({
          "relay.connected": true,
          "relay.apiBase": "http://localhost:3000",
          "relay.authToken": "test-token",
          "relay.projectId": "project-1",
          "relay.assumedProjectId": "project-1",
          "relay.assumedProjectName": "Project Alpha"
        })
      })

      await context.route("https://chatgpt.com/**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: fixtureHtml
        })
      })

      await context.route("http://localhost:3000/api/projects", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            projects: [
              { id: "project-1", name: "Project Alpha" },
              { id: "project-2", name: "Project Beta" }
            ]
          })
        })
      })

      await context.route("http://localhost:3000/api/settings", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            settings: {
              settings: {
                autoCapture: true,
                defaultTargetProfileKey: "chatgpt_planning",
                showSidepanelOnSupportedSites: true
              }
            },
            onboarding: {
              status: "completed",
              completedProjectId: "project-1",
              completedVia: "web",
              completedAt: "2026-03-12T00:00:00.000Z"
            },
          })
        })
      })

      await context.route(/http:\/\/localhost:3000\/api\/extension\/bindings(\?.*)?/, async (route) => {
        if (route.request().method() === "POST") {
          const payload = JSON.parse(route.request().postData() ?? "{}") as { projectId?: string }
          if (payload.projectId) {
            selectedProjectId = payload.projectId
          }

          await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({ binding: { ok: true } })
          })
          return
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            binding: {
              binding: {
                id: `binding-${selectedProjectId}`,
                bindingKind: "domain",
                domain: "chatgpt.com",
                tabId: null,
                platform: "chatgpt",
                updatedAt: "2026-03-12T00:00:00.000Z"
              },
              project: {
                id: selectedProjectId,
                name: selectedProjectId === "project-1" ? "Project Alpha" : "Project Beta"
              }
            }
          })
        })
      })

      await context.route(/http:\/\/localhost:3000\/api\/projects\/project-(1|2)$/, async (route) => {
        const projectId = route.request().url().endsWith("project-1") ? "project-1" : "project-2"
        const projectName = projectId === "project-1" ? "Project Alpha" : "Project Beta"

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            dashboard: {
              stateStatus: {
                rawCapturePresent: true,
                digestStatus: "completed",
                projectStateReady: true,
                digestErrorMessage: null,
                lastCapturedAt: "2026-03-12T00:00:00.000Z",
                lastDigestAt: "2026-03-12T00:01:00.000Z",
                activeJobId: null,
                activeJobStatus: "completed",
                activeJobStage: "completed",
                activeJobAttempts: 1,
                fallbackPlanned: true,
                fallbackUsed: false
              },
              projectState: {
                updatedAt: "2026-03-12T00:01:00.000Z",
                decisions: ["Use one-click insertion."],
                constraints: ["Do not require a preview step."],
                openTasks: ["Ship the rewrite."]
              },
              recentSessions: [{ id: "session-1" }],
              memory: [{ id: "memory-1" }],
              packets: [{ createdAt: "2026-03-12T00:01:00.000Z" }],
              project: {
                id: projectId,
                name: projectName
              }
            }
          })
        })
      })

      await context.route(/http:\/\/localhost:3000\/api\/projects\/project-(1|2)\/bootstrap$/, async (route) => {
        const projectName = selectedProjectId === "project-1" ? "Project Alpha" : "Project Beta"

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "ready",
            packet: {
              content: `${projectName} brief\n\nContinue this project from the latest saved context.`,
              generationMetadata: {
                actual_model: "gemini"
              }
            },
            stateStatus: {
              rawCapturePresent: true,
              digestStatus: "completed",
              projectStateReady: true,
              digestErrorMessage: null,
              lastCapturedAt: "2026-03-12T00:00:00.000Z",
              lastDigestAt: "2026-03-12T00:01:00.000Z",
              activeJobId: null,
              activeJobStatus: "completed",
              activeJobStage: "completed",
              activeJobAttempts: 1,
              fallbackPlanned: true,
              fallbackUsed: false
            }
          })
        })
      })

      const page = await context.newPage()
      await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded" })

      const chip = page.locator("#relay-inline-chip")
      await expect(chip).toBeVisible()
      await expect(chip.getByText("Insert project brief")).toBeVisible()
      await expect(chip.locator(".relay-inline-chip__title")).toHaveText("Project Alpha")

      await chip.getByRole("button", { name: "Switch project" }).click()
      await chip.locator('.relay-inline-chip__projectOption[data-project-id="project-2"]').click()
      await expect(chip.locator(".relay-inline-chip__title")).toHaveText("Project Beta")

      const insertButton = chip.locator(".relay-inline-chip__button")
      await expect(insertButton).toBeEnabled()
      await insertButton.click()
      await expect(page.locator("#prompt-textarea")).toHaveValue(/Project Beta brief/)
    } finally {
      await Promise.race([
        context.close(),
        new Promise((resolve) => {
          setTimeout(resolve, 1000)
        })
      ])
      fs.rmSync(userDataDir, { recursive: true, force: true })
    }
  })
})
