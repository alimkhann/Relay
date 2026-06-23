import { beforeEach, describe, expect, it, vi } from "vitest"

const { authPostMock } = vi.hoisted(() => ({
  authPostMock: vi.fn(),
}))

vi.mock("@/lib/auth/server", () => ({
  requireAuthServer: () => ({
    handler: () => ({
      POST: authPostMock,
    }),
  }),
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
  })

  it("redirects to Neon social init while preserving challenge cookies", async () => {
    authPostMock.mockResolvedValue(responseWithCookies({
      url: "https://relay-auth.example.com/neondb/auth/sign-in/social/init?token=token-1",
    }, [
      "__Secure-neon-auth.session_challange=challenge; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=None; Partitioned",
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

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://relay-auth.example.com/neondb/auth/sign-in/social/init?token=token-1",
    )
    expect(response.headers.getSetCookie()).toContain(
      "__Secure-neon-auth.session_challange=challenge; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=None; Partitioned",
    )
  })
})
