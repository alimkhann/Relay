import { beforeEach, describe, expect, it, vi } from "vitest"

const { redirectMock, resolveOptionalViewerMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`)
  }),
  resolveOptionalViewerMock: vi.fn(async () => null)
}))

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}))

vi.mock("@/server/policies/viewer", () => ({
  buildSignInHref: () => "/sign-in?next=%2Fdashboard&intent=sign-up",
  resolveAuthenticatedAppPath: () => "/dashboard",
  resolveOptionalViewer: resolveOptionalViewerMock
}))

import GetStartedPage from "./page"

describe("GetStartedPage", () => {
  beforeEach(() => {
    redirectMock.mockClear()
    resolveOptionalViewerMock.mockReset()
    resolveOptionalViewerMock.mockResolvedValue(null)
  })

  it("redirects anonymous users to signup intent login", async () => {
    await expect(GetStartedPage()).rejects.toThrow(
      "REDIRECT:/sign-in?next=%2Fdashboard&intent=sign-up",
    )
  })

  it("redirects authenticated users straight into the dashboard", async () => {
    resolveOptionalViewerMock.mockResolvedValueOnce({
      userId: "user-1",
      mode: "session"
    } as any)

    await expect(GetStartedPage()).rejects.toThrow("REDIRECT:/dashboard")
  })
})
