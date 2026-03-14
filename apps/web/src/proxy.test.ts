import { beforeEach, describe, expect, it, vi } from "vitest"

const { middlewareFn, middlewareFactory, getAuthServerMock } = vi.hoisted(() => ({
  middlewareFn: vi.fn(),
  middlewareFactory: vi.fn(),
  getAuthServerMock: vi.fn()
}))

middlewareFactory.mockImplementation(() => middlewareFn)
getAuthServerMock.mockImplementation(() => ({
  middleware: middlewareFactory
}))

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: getAuthServerMock
}))

import proxy from "./proxy"

describe("proxy", () => {
  beforeEach(() => {
    middlewareFn.mockReset()
    middlewareFactory.mockClear()
    getAuthServerMock.mockClear()
  })

  it("keeps standard sign-in for protected app routes", async () => {
    const request = {
      nextUrl: {
        pathname: "/dashboard"
      }
    } as any

    await proxy(request)

    expect(middlewareFactory).toHaveBeenCalledWith({
      loginUrl: "/sign-in"
    })
    expect(middlewareFn).toHaveBeenCalledWith(request)
  })

  it("does not special-case get-started in middleware anymore", async () => {
    const request = {
      nextUrl: {
        pathname: "/settings"
      }
    } as any

    await proxy(request)

    expect(middlewareFactory).toHaveBeenCalledWith({
      loginUrl: "/sign-in"
    })
    expect(middlewareFn).toHaveBeenCalledWith(request)
  })

  it("answers extension api preflight before auth middleware", async () => {
    const request = {
      method: "OPTIONS",
      headers: {
        get: vi.fn((name: string) =>
          name.toLowerCase() === "origin"
            ? "chrome-extension://capboopgpcmoakcilbjlbepmiobhdehj"
            : null
        )
      },
      nextUrl: {
        pathname: "/api/extension/auth/local"
      }
    } as any

    const response = await proxy(request)

    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "chrome-extension://capboopgpcmoakcilbjlbepmiobhdehj"
    )
    expect(middlewareFactory).not.toHaveBeenCalled()
    expect(middlewareFn).not.toHaveBeenCalled()
  })
})
