import { expect, test } from "@playwright/test"

test("landing page presents the new product-facing hero", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByRole("heading", { name: /stop re-briefing the next ai/i })).toBeVisible()
  await expect(page.getByText(/cross-ai project memory/i)).toBeVisible()
  await expect(page.getByRole("link", { name: /see your project view/i })).toBeVisible()
})
