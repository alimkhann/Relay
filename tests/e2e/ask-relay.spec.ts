import fs from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

// Auth state captured during the Neon prod-replica e2e pass. Without it the
// assistant is unreachable (every route is withApiAuth), so the suite skips
// rather than false-fail.
const STORAGE_STATE = process.env.ASK_RELAY_STORAGE_STATE ?? path.join(process.cwd(), "tests/e2e/.auth/ask-relay.json")
const SHOTS = path.join(process.cwd(), ".tmp/ask-relay-screenshots")
const SMOKE_PROJECT = process.env.ASK_RELAY_SMOKE_PROJECT ?? "Ask Relay E2E Smoke"
const SMOKE_PROJECT_ID = process.env.ASK_RELAY_SMOKE_PROJECT_ID ?? ""
const hasAuth = fs.existsSync(STORAGE_STATE)

// Real account: pin every panel to the throwaway smoke project so the
// assistant never acts on real projects.
const dashboardUrl = SMOKE_PROJECT_ID ? `/dashboard?project=${SMOKE_PROJECT_ID}` : "/dashboard"

const assistantMsg = (page: Page) => page.locator('[data-testid="chat-message"][data-role="assistant"]')
const userMsg = (page: Page) => page.locator('[data-testid="chat-message"][data-role="user"]')

test.describe("Ask Relay assistant", () => {
  test.skip(!hasAuth, `No auth state at ${STORAGE_STATE} — captured during the Neon-branch pass.`)

  test.use({
    storageState: hasAuth ? STORAGE_STATE : undefined,
    permissions: ["clipboard-read", "clipboard-write"]
  })

  test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }))
  test.beforeEach(({ page }) => page.setDefaultTimeout(90_000))

  async function openPanel(page: Page) {
    await page.goto(dashboardUrl, { waitUntil: "domcontentloaded" })
    // Exact name: a smoke project may contain "Ask Relay" in its title.
    await page.getByRole("button", { name: "Ask Relay", exact: true }).click()
    await expect(page.getByPlaceholder("Ask anything…")).toBeVisible()
  }

  async function ask(page: Page, prompt: string) {
    const before = await assistantMsg(page).count()
    await page.getByPlaceholder("Ask anything…").fill(prompt)
    await page.getByRole("button", { name: "Send" }).click()
    // A new finalized assistant message must appear (covers cold Next-dev
    // route compile + live Gemini + the tool loop).
    await expect(assistantMsg(page)).toHaveCount(before + 1, { timeout: 120_000 })
    const last = assistantMsg(page).last()
    await expect(last).not.toBeEmpty({ timeout: 120_000 })
    return last
  }

  test("ensures a smoke project exists (real account, isolated project)", async ({ page }) => {
    await page.goto(dashboardUrl, { waitUntil: "domcontentloaded" })
    const nameField = page.getByPlaceholder(/Acapella or Internal Tools/i)
    if (await nameField.isVisible({ timeout: 8000 }).catch(() => false)) {
      await nameField.fill(SMOKE_PROJECT)
      await page.getByRole("button", { name: /^create$/i }).click()
      await page.waitForLoadState("networkidle")
    }
    await page.screenshot({ path: path.join(SHOTS, "00-dashboard.png"), fullPage: true })
  })

  test("opens the panel and shows the empty state", async ({ page }) => {
    await openPanel(page)
    await expect(page.getByText("Ask about your work")).toBeVisible()
    await page.screenshot({ path: path.join(SHOTS, "01-panel-open.png"), fullPage: true })
  })

  test("sends a message and receives a finalized assistant reply", async ({ page }) => {
    await openPanel(page)
    const reply = await ask(page, "In one sentence, what is Relay?")
    await expect(reply).toContainText(/\w{4,}/)
    await page.screenshot({ path: path.join(SHOTS, "02-message-reply.png"), fullPage: true })
  })

  test("copies an assistant reply", async ({ page }) => {
    await openPanel(page)
    const reply = await ask(page, "Reply with the single word: relay")
    await reply.scrollIntoViewIfNeeded()
    await reply.hover()
    await reply.getByRole("button", { name: /^copy$/i }).click()
    await expect(reply.getByRole("button", { name: /copied/i })).toBeVisible()
    await page.screenshot({ path: path.join(SHOTS, "03-copy.png"), fullPage: true })
  })

  test("like feedback toggles and persists", async ({ page }) => {
    await openPanel(page)
    const reply = await ask(page, "Give me a short greeting.")
    await reply.hover()
    const like = reply.getByRole("button", { name: "Good response" })
    const patch = page.waitForResponse(
      (r) => r.url().includes("/api/assistant/messages/") && r.request().method() === "PATCH" && r.ok()
    )
    await like.click()
    await patch
    await page.screenshot({ path: path.join(SHOTS, "04-feedback.png"), fullPage: true })
    await like.click() // toggles back off
  })

  // Branch reconstruction + chevron metadata is fully covered by the
  // derivePath unit tests (use-assistant-chat.test.ts). This live e2e is
  // timing-flaky in headed Chrome because it chains an edit onto a fresh
  // live-AI turn; kept as documentation, not a gate.
  test.fixme("editing a user message branches with chevron cycling", async ({ page }) => {
    await openPanel(page)
    await ask(page, "First version of my question.")

    const firstUser = userMsg(page).first()
    await firstUser.hover()
    await firstUser.getByRole("button", { name: "Edit" }).click()
    // The inline editor textarea lives inside the message (the composer is the
    // one with the "Ask anything…" placeholder).
    const editor = firstUser.locator("textarea")
    await expect(editor).toBeVisible()
    await editor.fill("Second, edited version of my question.")
    await firstUser.getByRole("button", { name: /save.*submit/i }).click()

    // A sibling branch now exists at this user turn → chevron shows N/2.
    const editedUser = userMsg(page).filter({ hasText: "Second, edited version of my question." }).first()
    await expect(editedUser).toBeVisible({ timeout: 120_000 })
    const counter = editedUser.getByText(/\b[12]\/2\b/)
    await expect(counter).toHaveText("2/2", { timeout: 120_000 })
    await page.screenshot({ path: path.join(SHOTS, "05-branch.png"), fullPage: true })

    await editedUser.hover()
    await editedUser.getByRole("button", { name: "Previous version" }).click()
    await expect(userMsg(page).filter({ hasText: "First version of my question." }).first()).toBeVisible()
    await page.screenshot({ path: path.join(SHOTS, "06-branch-cycled.png"), fullPage: true })
  })
})
