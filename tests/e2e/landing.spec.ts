import { expect, test } from "@playwright/test"

test("landing page presents the new product-facing hero", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByRole("heading", { name: /stop rebuilding your project every time the chat resets/i })).toBeVisible()
  await expect(page.getByText(/inserts a clean project brief into the next fresh chat/i)).toBeVisible()
  await expect(page.locator("header").getByRole("link", { name: /open relay/i })).toBeVisible()
})
