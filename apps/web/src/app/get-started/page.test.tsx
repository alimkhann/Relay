import { beforeEach, describe, expect, it, vi } from "vitest"

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`)
  })
}))

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}))

import GetStartedPage from "./page"

describe("GetStartedPage", () => {
  beforeEach(() => {
    redirectMock.mockClear()
  })

  it("redirects to the dashboard and lets middleware decide auth", async () => {
    await expect(GetStartedPage()).rejects.toThrow("REDIRECT:/dashboard")
  })
})
