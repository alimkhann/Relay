import { beforeEach, describe, expect, it, vi } from "vitest"

const { redirectMock, getSessionMock, getAuthServerMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`)
  }),
  getSessionMock: vi.fn(),
  getAuthServerMock: vi.fn()
}))

getAuthServerMock.mockImplementation(() => ({
  getSession: getSessionMock
}))

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}))

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: getAuthServerMock
}))

import GetStartedPage from "./page"

describe("GetStartedPage", () => {
  beforeEach(() => {
    redirectMock.mockClear()
    getSessionMock.mockReset()
  })

  it("redirects signed-in users to the dashboard", async () => {
    getSessionMock.mockResolvedValueOnce({
      data: {
        user: {
          id: "user-1"
        }
      }
    })

    await expect(GetStartedPage()).rejects.toThrow("REDIRECT:/dashboard")
  })

  it("routes signed-out users into signup intent", async () => {
    getSessionMock.mockResolvedValueOnce({ data: null })

    await expect(GetStartedPage()).rejects.toThrow(
      "REDIRECT:/sign-in?next=%2Fdashboard&intent=sign-up"
    )
  })
})
