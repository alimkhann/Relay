import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  authGetMock,
  authPostMock,
  clearLocalSessionCookieMock,
  getAuthProviderMock,
} = vi.hoisted(() => ({
  authGetMock: vi.fn(),
  authPostMock: vi.fn(),
  clearLocalSessionCookieMock: vi.fn(),
  getAuthProviderMock: vi.fn(),
}))

vi.mock("@/lib/auth/local-session", () => ({
  clearLocalSessionCookie: clearLocalSessionCookieMock,
}))

vi.mock("@/lib/auth/provider", () => ({
  getAuthProvider: getAuthProviderMock,
}))

vi.mock("@/lib/auth/server", () => ({
  requireAuthServer: () => ({
    handler: () => ({
      GET: authGetMock,
      POST: authPostMock,
    }),
  }),
}))

import { POST } from "./route"

function responseWithCookies(body: unknown, cookies: string[] = [], init: ResponseInit = {}) {
  const response = Response.json(body, init)
  for (const cookie of cookies) {
    response.headers.append("Set-Cookie", cookie)
  }
  return response
}

describe("sign-out route", () => {
  beforeEach(() => {
    authGetMock.mockReset()
    authPostMock.mockReset()
    clearLocalSessionCookieMock.mockReset()
    getAuthProviderMock.mockReset()
    getAuthProviderMock.mockReturnValue("neon")
    authPostMock.mockResolvedValue(responseWithCookies({ success: true }, [
      "__Secure-neon-auth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]))
  })

  it("routes Google-linked sessions through Google logout after clearing Relay auth cookies", async () => {
    authGetMock.mockResolvedValue(Response.json([
      {
        id: "account-1",
        providerId: "google",
      },
    ]))

    const response = await POST(new Request("https://www.onrelay.app/auth/sign-out", {
      method: "POST",
      headers: {
        Cookie: "__Secure-neon-auth.session_token=session-1",
      },
    }))

    expect(authGetMock).toHaveBeenCalledTimes(1)
    const accountsRequest = authGetMock.mock.calls[0]![0] as Request
    expect(accountsRequest.url).toBe("https://www.onrelay.app/api/auth/list-accounts")
    expect(accountsRequest.headers.get("cookie")).toBe("__Secure-neon-auth.session_token=session-1")

    expect(authPostMock).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(
      "https://accounts.google.com/Logout?continue=https%3A%2F%2Fappengine.google.com%2F_ah%2Flogout%3Fcontinue%3Dhttps%253A%252F%252Fwww.onrelay.app%252Fget-started",
    )
    expect(response.headers.getSetCookie()).toContain(
      "__Secure-neon-auth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    )
  })

  it("keeps non-Google sessions on the normal Relay sign-out redirect", async () => {
    authGetMock.mockResolvedValue(Response.json([
      {
        id: "account-1",
        providerId: "credential",
      },
    ]))

    const response = await POST(new Request("https://www.onrelay.app/auth/sign-out", {
      method: "POST",
      headers: {
        Cookie: "__Secure-neon-auth.session_token=session-1",
      },
    }))

    expect(authPostMock).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("https://www.onrelay.app/get-started")
  })

  it("uses the local sign-out path without touching Neon or Google when local auth is active", async () => {
    getAuthProviderMock.mockReturnValue("local")

    const response = await POST(new Request("https://www.onrelay.app/auth/sign-out", {
      method: "POST",
    }))

    expect(clearLocalSessionCookieMock).toHaveBeenCalledTimes(1)
    expect(authGetMock).not.toHaveBeenCalled()
    expect(authPostMock).not.toHaveBeenCalled()
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("https://www.onrelay.app/get-started")
  })
})
