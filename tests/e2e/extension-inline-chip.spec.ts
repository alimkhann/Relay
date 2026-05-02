import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execSync } from "node:child_process"

import { chromium, expect, test } from "@playwright/test"

const extensionPath = path.join(process.cwd(), "apps/extension/build/chrome-mv3-prod")
const fixturePath = path.join(process.cwd(), "tests/e2e/fixtures/chatgpt-fresh.html")

test.describe("Relay inline chip", () => {
  test.beforeAll(() => {
    execSync("pnpm --filter @relay/extension build", {
      cwd: process.cwd(),
      stdio: "pipe"
    })
  })

  test("shows the chip on a fresh chat, allows switching projects, and inserts immediately", async () => {
    test.setTimeout(60000)

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

  test("shows autonomous association UI for an existing chat and keeps the sidebar project switcher wired", async () => {
    test.setTimeout(60000)

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-extension-existing-"))
    const existingChatHtml = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Cross-model context orchestrator</title>
          <style>
            body { font-family: sans-serif; background: #111; color: #eee; }
            main { max-width: 760px; margin: 40px auto; }
            [data-message-author-role] { margin: 18px 0; padding: 12px; border: 1px solid #333; }
            textarea { width: 100%; min-height: 120px; }
          </style>
        </head>
        <body>
          <main>
            <div data-message-author-role="user">Please design the browser extension association flow for Relay's cross-model context orchestrator.</div>
            <div data-message-author-role="assistant">I will map the Relay toast, sidebar, and project association logic.</div>
            <div data-message-author-role="user">Now generate a logo for it and make it abstract.</div>
            <div data-message-author-role="assistant">Image created for Relay.</div>
            <form><textarea id="prompt-textarea"></textarea></form>
          </main>
        </body>
      </html>
    `

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    })

    try {
      const serviceWorker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
      const extensionId = serviceWorker.url().split("/")[2]

      let selectedProjectId = "project-sunnad"

      await serviceWorker.evaluate(async () => {
        await chrome.storage.local.set({
          "relay.connected": true,
          "relay.apiBase": "http://localhost:3000",
          "relay.authToken": "test-token",
          "relay.projectId": "project-sunnad",
          "relay.assumedProjectId": "project-sunnad",
          "relay.assumedProjectName": "Sunnad",
          "relay.projectOptions": [
            {
              id: "project-sunnad",
              name: "Sunnad",
              description: "Group-first Islamic habit tracking stripped of all visual noise.",
              routingContext: { hasMeaningfulContext: false, keywords: [] }
            },
            {
              id: "project-relay",
              name: "Relay",
              description:
                "Relay is a browser-first cross-AI memory sidecar extension that keeps project context synchronized between ChatGPT, Claude, Perplexity, and other AIs autonomously.",
              routingContext: { hasMeaningfulContext: false, keywords: [] }
            }
          ],
          "relay.autoCapture": true,
          "relay.onboarding": {
            status: "completed",
            completedProjectId: "project-sunnad",
            completedVia: "web",
            completedAt: "2026-03-15T00:00:00.000Z"
          }
        })
      })

      await context.route("https://chatgpt.com/c/chat_123", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: existingChatHtml
        })
      })

      await context.route("http://localhost:3000/api/projects", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            projects: [
              {
                id: "project-sunnad",
                name: "Sunnad",
                description: "Group-first Islamic habit tracking stripped of all visual noise.",
                memoryCount: 0,
                sessionCount: 0,
                routingContext: { hasMeaningfulContext: false, keywords: [] }
              },
              {
                id: "project-relay",
                name: "Relay",
                description:
                  "Relay is a browser-first cross-AI memory sidecar extension that keeps project context synchronized between ChatGPT, Claude, Perplexity, and other AIs autonomously.",
                memoryCount: 0,
                sessionCount: 0,
                routingContext: { hasMeaningfulContext: false, keywords: [] }
              }
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
              completedProjectId: "project-sunnad",
              completedVia: "web",
              completedAt: "2026-03-15T00:00:00.000Z"
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
                name: selectedProjectId === "project-relay" ? "Relay" : "Sunnad"
              }
            }
          })
        })
      })

      await context.route(/http:\/\/localhost:3000\/api\/projects\/project-(sunnad|relay)$/, async (route) => {
        const projectId = route.request().url().endsWith("project-relay")
          ? "project-relay"
          : "project-sunnad"
        const projectName = projectId === "project-relay" ? "Relay" : "Sunnad"
        const description =
          projectId === "project-relay"
            ? "Relay is a browser-first cross-AI memory sidecar extension that keeps project context synchronized between ChatGPT, Claude, Perplexity, and other AIs autonomously."
            : "Group-first Islamic habit tracking stripped of all visual noise."

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            dashboard: {
              stateStatus: {
                rawCapturePresent: false,
                digestStatus: "idle",
                projectStateReady: false,
                digestErrorMessage: null,
                lastCapturedAt: null,
                lastDigestAt: null,
                activeJobId: null,
                activeJobStatus: "idle",
                activeJobStage: null,
                activeJobAttempts: 0,
                fallbackPlanned: false,
                fallbackUsed: false
              },
              projectState: null,
              recentSessions: [],
              sessionHistory: [],
              memory: [],
              packets: [],
              project: {
                id: projectId,
                name: projectName,
                description
              }
            }
          })
        })
      })

      const page = await context.newPage()
      await page.goto("https://chatgpt.com/c/chat_123", { waitUntil: "domcontentloaded" })

      const toast = page.locator("#relay-association-toast")
      await expect(toast).toBeVisible({ timeout: 6000 })
      await expect(toast).toContainText("Saving to Relay")

      const popup = await context.newPage()
      await popup.goto(`chrome-extension://${extensionId}/popup.html`)

      const initialState = await popup.evaluate(async () => {
        const tabs = await chrome.tabs.query({})
        const chatTab = tabs.find((tab) => tab.url?.includes("chatgpt.com/c/chat_123"))
        return await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "RELAY_GET_ACTIVE_PROJECT_STATE",
              payload: { tabId: chatTab?.id },
            },
            resolve,
          )
        })
      })

      expect(initialState.chatAssociation.status).toBe("pending")
      expect(initialState.chatAssociation.projectName).toBe("Relay")
      expect(initialState.projectName).toBe("Relay")

      const switchedState = await popup.evaluate(async () => {
        const tabs = await chrome.tabs.query({})
        const chatTab = tabs.find((tab) => tab.url?.includes("chatgpt.com/c/chat_123"))

        await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "RELAY_SET_CHAT_ASSOCIATION_PROJECT",
              payload: {
                projectId: "project-sunnad",
                tabId: chatTab?.id,
                source: "sidebar",
              },
            },
            resolve,
          )
        })

        return await new Promise<any>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "RELAY_GET_ACTIVE_PROJECT_STATE",
              payload: { tabId: chatTab?.id },
            },
            resolve,
          )
        })
      })

      expect(switchedState.chatAssociation.projectName).toBe("Sunnad")
      expect(switchedState.projectName).toBe("Sunnad")
      expect(switchedState.associationToast.projectName).toBe("Sunnad")
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
