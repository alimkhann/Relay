import { beforeEach, describe, expect, it, vi } from "vitest"

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`)
  })
}))

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}))

vi.mock("@/server/policies/viewer", () => ({
  buildSignInHref: () => "/sign-in?next=%2Fdashboard&intent=sign-up"
}))

import GetStartedPage from "./page"

describe("GetStartedPage", () => {
  beforeEach(() => {
    redirectMock.mockClear()
  })

  it("redirects to signup intent login instead of silently jumping into the dashboard", async () => {
    await expect(GetStartedPage()).rejects.toThrow(
      "REDIRECT:/sign-in?next=%2Fdashboard&intent=sign-up",
    )
  })
})
