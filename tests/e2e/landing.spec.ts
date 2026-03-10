import { expect, test } from "@playwright/test"

test("landing page links into the dashboard", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByRole("heading", { name: /keep the project in motion/i })).toBeVisible()
  await page.getByRole("link", { name: /open dashboard/i }).click()
  await expect(page.getByRole("heading", { name: /current workspace/i })).toBeVisible()
})
