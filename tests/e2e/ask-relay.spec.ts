import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

// Auth state captured in Part C after the user signs in with Google against
// the Neon prod-replica branch. Without it the assistant is unreachable
// (every route is withApiAuth), so the suite skips rather than false-fails.
const STORAGE_STATE = process.env.ASK_RELAY_STORAGE_STATE ?? path.join(process.cwd(), "tests/e2e/.auth/ask-relay.json")
const SHOTS = path.join(process.cwd(), ".tmp/ask-relay-screenshots")

const hasAuth = fs.existsSync(STORAGE_STATE)

test.describe("Ask Relay assistant", () => {
  test.skip(!hasAuth, `No auth state at ${STORAGE_STATE} — captured during Part C.`)

  test.use({
    storageState: hasAuth ? STORAGE_STATE : undefined,
    permissions: ["clipboard-read", "clipboard-write"]
  })

  test.beforeAll(() => {
    fs.mkdirSync(SHOTS, { recursive: true })
  })

  async function openPanel(page: Page) {
    await page.goto("/dashboard")
    await page.getByRole("button", { name: /ask relay/i }).first().click()
    await expect(page.getByPlaceholder("Ask anything…")).toBeVisible()
  }

  test("opens the panel from the dashboard launcher", async ({ page }) => {
    await openPanel(page)
    await expect(page.getByText("Ask about your work")).toBeVisible()
    await page.screenshot({ path: path.join(SHOTS, "01-panel-open.png"), fullPage: true })
  })

  test("sends a message and receives a streamed assistant reply", async ({ page }) => {
    await openPanel(page)
    await page.getByPlaceholder("Ask anything…").fill("In one sentence, what is Relay?")
    await page.getByRole("button", { name: "Send" }).click()

    // Live model call — generous budget, assert an assistant bubble appears.
    const assistantBubble = page.locator(".prose, [class*='relay-soft']").last()
    await expect(assistantBubble).toBeVisible({ timeout: 45_000 })
    await expect
      .poll(async () => (await assistantBubble.innerText()).trim().length, { timeout: 45_000 })
      .toBeGreaterThan(0)
    await page.screenshot({ path: path.join(SHOTS, "02-message-reply.png"), fullPage: true })
  })

  test("copy control confirms it copied", async ({ page }) => {
    await openPanel(page)
    await page.getByPlaceholder("Ask anything…").fill("Say the word relay back to me.")
    await page.getByRole("button", { name: "Send" }).click()
    await expect(page.getByRole("button", { name: /^copy$/i }).first()).toBeVisible({ timeout: 45_000 })

    await page.getByRole("button", { name: /^copy$/i }).first().click()
    await expect(page.getByRole("button", { name: /copied/i }).first()).toBeVisible()
    await page.screenshot({ path: path.join(SHOTS, "03-copy.png"), fullPage: true })
  })

  test("like feedback toggles on and off", async ({ page }) => {
    await openPanel(page)
    await page.getByPlaceholder("Ask anything…").fill("Reply with a short greeting.")
    await page.getByRole("button", { name: "Send" }).click()

    const like = page.getByRole("button", { name: "Good response" }).first()
    await expect(like).toBeVisible({ timeout: 45_000 })

    const patch = page.waitForResponse(
      (r) => r.url().includes("/api/assistant/messages/") && r.request().method() === "PATCH"
    )
    await like.click()
    await patch
    await page.screenshot({ path: path.join(SHOTS, "04-feedback.png"), fullPage: true })
    // Unlike (same control toggles back to null).
    await like.click()
  })

  test("editing a user message branches with chevron cycling", async ({ page }) => {
    await openPanel(page)
    await page.getByPlaceholder("Ask anything…").fill("First version of my question.")
    await page.getByRole("button", { name: "Send" }).click()
    await expect(page.getByRole("button", { name: "Good response" }).first()).toBeVisible({ timeout: 45_000 })

    await page.getByRole("button", { name: "Edit" }).first().click()
    const editor = page.locator("textarea").nth(0)
    await editor.fill("Second, edited version of my question.")
    await page.getByRole("button", { name: /save.*submit/i }).click()

    // A sibling branch now exists at this user turn → chevron shows position.
    await expect(page.getByText(/^[12]\/2$/).first()).toBeVisible({ timeout: 45_000 })
    await page.screenshot({ path: path.join(SHOTS, "05-branch.png"), fullPage: true })

    await page.getByRole("button", { name: "Previous version" }).first().click()
    await expect(page.getByText("First version of my question.")).toBeVisible()
    await page.screenshot({ path: path.join(SHOTS, "06-branch-cycled.png"), fullPage: true })
  })
})
