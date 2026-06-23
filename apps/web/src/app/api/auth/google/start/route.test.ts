import { beforeEach, describe, expect, it, vi } from "vitest"

const { authPostMock, logServerEventMock } = vi.hoisted(() => ({
  authPostMock: vi.fn(),
  logServerEventMock: vi.fn(),
}))

vi.mock("@/lib/auth/server", () => ({
  requireAuthServer: () => ({
    handler: () => ({
      POST: authPostMock,
    }),
  }),
}))

vi.mock("@/server/logging/logger", () => ({
  logServerEvent: logServerEventMock,
}))

import { GET } from "./route"

function responseWithCookies(body: unknown, cookies: string[] = [], init: ResponseInit = {}) {
  const response = Response.json(body, init)
  for (const cookie of cookies) {
    response.headers.append("Set-Cookie", cookie)
  }
  return response
}

describe("Google auth start route", () => {
  beforeEach(() => {
    authPostMock.mockReset()
    logServerEventMock.mockReset()
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://relay-auth.example.com")
    vi.stubGlobal("fetch", vi.fn())
  })

  it("starts Neon Google auth and redirects to Google with account selection forced", async () => {
    authPostMock.mockResolvedValue(responseWithCookies({
      url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=google-client-id",
    }, [
      "__Secure-neon-auth.session_challenge=challenge; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]))

    const response = await GET(
      new Request("https://www.onrelay.app/api/auth/google/start?next=/dashboard&intent=sign-up"),
    )

    expect(authPostMock).toHaveBeenCalledTimes(1)
    const signInRequest = authPostMock.mock.calls[0]![0] as Request
    expect(signInRequest.url).toBe("https://www.onrelay.app/api/auth/sign-in/social")
    expect(await signInRequest.json()).toMatchObject({
      provider: "google",
      callbackURL: "/dashboard",
      newUserCallbackURL: "/dashboard",
      disableRedirect: true,
      requestSignUp: true,
    })

    const location = response.headers.get("location")
    expect(location).toBeTruthy()
    const url = new URL(location!)
    expect(url.origin).toBe("https://accounts.google.com")
    expect(url.searchParams.get("prompt")).toBe("select_account")
    expect(response.headers.getSetCookie()).toContain(
      "__Secure-neon-auth.session_challenge=challenge; Path=/; HttpOnly; Secure; SameSite=Lax",
    )
  })

  it("unwraps the Neon intermediate redirect while preserving challenge cookies", async () => {
    authPostMock.mockResolvedValue(responseWithCookies({
      url: "https://relay-auth.example.com/oauth2/init/google",
    }, [
      "__Secure-neon-auth.session_challenge=initial; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]))

    vi.mocked(fetch).mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location: "https://accounts.google.com/o/oauth2/v2/auth?client_id=google-client-id",
          "set-cookie": "__Secure-neon-auth.session_challenge=updated; Path=/; HttpOnly; Secure; SameSite=Lax",
        },
      }),
    )

    const response = await GET(
      new Request("https://www.onrelay.app/api/auth/google/start?next=/settings&intent=sign-in"),
    )

    expect(fetch).toHaveBeenCalledWith(
      new URL("https://relay-auth.example.com/oauth2/init/google"),
      expect.objectContaining({
        redirect: "manual",
        headers: {
          Cookie: "__Secure-neon-auth.session_challenge=initial",
        },
      }),
    )

    const location = response.headers.get("location")
    expect(location).toBeTruthy()
    const url = new URL(location!)
    expect(url.origin).toBe("https://accounts.google.com")
    expect(url.searchParams.get("prompt")).toBe("select_account")
    expect(response.headers.getSetCookie()).toEqual([
      "__Secure-neon-auth.session_challenge=initial; Path=/; HttpOnly; Secure; SameSite=Lax",
      "__Secure-neon-auth.session_challenge=updated; Path=/; HttpOnly; Secure; SameSite=Lax",
    ])
  })
})
