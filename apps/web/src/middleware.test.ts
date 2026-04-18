import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

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

import middleware from "./middleware"

describe("middleware", () => {
  beforeEach(() => {
    middlewareFn.mockReset()
    middlewareFactory.mockClear()
    getAuthServerMock.mockClear()
  })

  it("keeps standard sign-in for protected app routes", async () => {
    const request = {
      method: "GET",
      headers: {
        get: vi.fn(() => null)
      },
      nextUrl: {
        pathname: "/dashboard"
      }
    } as any

    await middleware(request)

    expect(middlewareFactory).toHaveBeenCalledWith({
      loginUrl: "/sign-in"
    })
    expect(middlewareFn).toHaveBeenCalledWith(request)
  })

  it("does not special-case get-started in middleware anymore", async () => {
    const request = {
      method: "GET",
      headers: {
        get: vi.fn(() => null)
      },
      nextUrl: {
        pathname: "/settings"
      }
    } as any

    await middleware(request)

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

    const response = await middleware(request)

    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "chrome-extension://capboopgpcmoakcilbjlbepmiobhdehj"
    )
    expect(middlewareFactory).not.toHaveBeenCalled()
    expect(middlewareFn).not.toHaveBeenCalled()
  })

  it("rewrites supported public pages to the markdown variant when requested", async () => {
    const request = new NextRequest("https://www.onrelay.app/docs/api", {
      headers: {
        Accept: "text/markdown",
      },
    })

    const response = await middleware(request)

    expect(response.headers.get("x-middleware-rewrite")).toContain("/agent-markdown?pathname=%2Fdocs%2Fapi")
    expect(middlewareFactory).not.toHaveBeenCalled()
    expect(middlewareFn).not.toHaveBeenCalled()
  })
})
