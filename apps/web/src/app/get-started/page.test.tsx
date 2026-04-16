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
  buildSignInHref: (next: string) => `/sign-in?next=${encodeURIComponent(next)}&intent=sign-up`,
  resolveAuthenticatedAppPath: (next: string) => next,
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
    await expect(GetStartedPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/sign-in?next=%2Fdashboard&intent=sign-up",
    )
  })

  it("redirects authenticated users straight into the dashboard", async () => {
    resolveOptionalViewerMock.mockResolvedValueOnce({
      userId: "user-1",
      mode: "session"
    } as any)

    await expect(GetStartedPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/dashboard")
  })

  it("redirects upgrade intent to billing settings", async () => {
    await expect(
      GetStartedPage({ searchParams: Promise.resolve({ upgrade: "true" }) }),
    ).rejects.toThrow("REDIRECT:/sign-in?next=%2Fsettings%3Fsection%3Dbilling&intent=sign-up")
  })
})
