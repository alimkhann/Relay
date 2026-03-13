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

vi.mock("@/server/policies/viewer", () => ({
  buildSignInHref: () => "/sign-in?next=%2Fdashboard&intent=sign-up"
}))

import proxy from "./proxy"

describe("proxy", () => {
  beforeEach(() => {
    middlewareFn.mockReset()
    middlewareFactory.mockClear()
    getAuthServerMock.mockClear()
  })

  it("routes get-started through signup intent login", async () => {
    const request = {
      nextUrl: {
        pathname: "/get-started"
      }
    } as any

    await proxy(request)

    expect(middlewareFactory).toHaveBeenCalledWith({
      loginUrl: "/sign-in?next=%2Fdashboard&intent=sign-up"
    })
    expect(middlewareFn).toHaveBeenCalledWith(request)
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
})
