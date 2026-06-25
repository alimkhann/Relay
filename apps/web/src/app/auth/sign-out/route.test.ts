import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  authGetMock,
  authPostMock,
  clearLocalSessionCookieFromResponseMock,
  getAuthProviderMock,
} = vi.hoisted(() => ({
  authGetMock: vi.fn(),
  authPostMock: vi.fn(),
  clearLocalSessionCookieFromResponseMock: vi.fn((response: Response) => response),
  getAuthProviderMock: vi.fn(),
}))

vi.mock("@/lib/auth/local-session", () => ({
  clearLocalSessionCookieFromResponse: clearLocalSessionCookieFromResponseMock,
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
    clearLocalSessionCookieFromResponseMock.mockReset()
    clearLocalSessionCookieFromResponseMock.mockImplementation((response: Response) => response)
    getAuthProviderMock.mockReset()
    getAuthProviderMock.mockReturnValue("neon")
    authPostMock.mockResolvedValue(responseWithCookies({ success: true }, [
      "__Secure-neon-auth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]))
  })

  it("returns a Relay redirect target for browser-managed sign-out", async () => {
    authGetMock.mockResolvedValue(Response.json([
      {
        id: "account-1",
        providerId: "google",
      },
    ]))

    const response = await POST(new Request("https://www.onrelay.app/auth/sign-out", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Cookie: "__Secure-neon-auth.session_token=session-1",
      },
    }))

    expect(authGetMock).not.toHaveBeenCalled()
    expect(authPostMock).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ redirectTo: "/get-started" })
    const setCookies = response.headers.getSetCookie()
    expect(setCookies.some((cookie) => cookie.includes("__Secure-neon-auth.session_token=;") && !cookie.includes("Domain="))).toBe(true)
    expect(setCookies.some((cookie) => cookie.includes("__Secure-neon-auth.session_token=;") && cookie.includes("Domain=.onrelay.app"))).toBe(true)
  })

  it("keeps plain server redirects on Relay instead of showing a Google redirect notice", async () => {
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

    expect(authPostMock).toHaveBeenCalledTimes(1)
    expect(authGetMock).not.toHaveBeenCalled()
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("https://www.onrelay.app/get-started")
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
    expect(authGetMock).not.toHaveBeenCalled()
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("https://www.onrelay.app/get-started")
  })

  it("uses the same JSON redirect target for non-Google sign-out", async () => {
    authGetMock.mockResolvedValue(Response.json([
      {
        id: "account-1",
        providerId: "credential",
      },
    ]))

    const response = await POST(new Request("https://www.onrelay.app/auth/sign-out", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Cookie: "__Secure-neon-auth.session_token=session-1",
      },
    }))

    expect(authPostMock).toHaveBeenCalledTimes(1)
    expect(authGetMock).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ redirectTo: "/get-started" })
  })

  it("uses the local sign-out path without touching Neon or Google when local auth is active", async () => {
    getAuthProviderMock.mockReturnValue("local")

    const response = await POST(new Request("https://www.onrelay.app/auth/sign-out", {
      method: "POST",
    }))

    expect(clearLocalSessionCookieFromResponseMock).toHaveBeenCalledTimes(1)
    expect(authGetMock).not.toHaveBeenCalled()
    expect(authPostMock).not.toHaveBeenCalled()
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("https://www.onrelay.app/get-started")
  })
})
