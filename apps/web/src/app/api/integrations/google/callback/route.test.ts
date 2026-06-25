import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  authHandlerPostMock,
  decryptSecretMock,
  exchangeGoogleAuthCodeMock,
  logServerEventMock,
} = vi.hoisted(() => ({
  authHandlerPostMock: vi.fn(),
  decryptSecretMock: vi.fn(),
  exchangeGoogleAuthCodeMock: vi.fn(),
  logServerEventMock: vi.fn(),
}))

vi.mock("@/lib/auth/server", () => ({
  requireAuthServer: () => ({
    handler: () => ({
      POST: authHandlerPostMock,
    }),
  }),
}))

vi.mock("@/server/lib/secret-crypto", () => ({
  decryptSecret: decryptSecretMock,
}))

vi.mock("@/server/services/integrations/google-service", () => ({
  exchangeGoogleAuthCode: exchangeGoogleAuthCodeMock,
  upsertGoogleAccount: vi.fn(),
}))

vi.mock("@/server/logging/logger", () => ({
  logServerEvent: logServerEventMock,
}))

vi.mock("@/lib/telemetry/posthog-server", () => ({
  captureServerEvent: vi.fn(),
  captureServerException: vi.fn(),
}))

import { GET } from "./route"

const SESSION_TOKEN_COOKIE_NAME = "__Secure-neon-auth.session_token"

function authState(input: { nextPath?: string; intent?: string } = {}) {
  return JSON.stringify({
    mode: "auth",
    nextPath: input.nextPath ?? "/dashboard",
    intent: input.intent ?? "sign-up",
    ts: Date.now(),
  })
}

describe("Google integration callback auth mode", () => {
  beforeEach(() => {
    authHandlerPostMock.mockReset()
    decryptSecretMock.mockReset()
    exchangeGoogleAuthCodeMock.mockReset()
    logServerEventMock.mockReset()

    decryptSecretMock.mockImplementation(() => authState())
    exchangeGoogleAuthCodeMock.mockResolvedValue({
      id_token: "google-id-token",
      access_token: "google-access-token",
    })
  })

  it("forwards Neon auth handler session cookies onto the app redirect", async () => {
    authHandlerPostMock.mockResolvedValue(new Response(JSON.stringify({ user: { id: "user-1" } }), {
      status: 200,
      headers: {
        "Set-Cookie": `${SESSION_TOKEN_COOKIE_NAME}=neon-session-token; Path=/; HttpOnly; Secure; SameSite=Lax`,
      },
    }))

    const response = await GET(
      new Request("https://www.onrelay.app/api/integrations/google/callback?code=google-code&state=encrypted"),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://www.onrelay.app/dashboard")
    expect(response.headers.getSetCookie().join("\n")).toContain(
      "__Secure-neon-auth.session_token=neon-session-token",
    )

    expect(authHandlerPostMock).toHaveBeenCalledOnce()
    const [authRequest, authContext] = authHandlerPostMock.mock.calls[0]!
    expect(authRequest.url).toBe("https://www.onrelay.app/api/auth/sign-in/social")
    expect(authRequest.method).toBe("POST")
    await expect(authRequest.json()).resolves.toEqual({
      provider: "google",
      disableRedirect: true,
      requestSignUp: true,
      idToken: {
        token: "google-id-token",
        accessToken: "google-access-token",
      },
    })
    await expect(authContext.params).resolves.toEqual({ path: ["sign-in", "social"] })
    expect(logServerEventMock).toHaveBeenCalledWith(expect.objectContaining({
      event: "google_auth.callback_session_established",
      context: expect.objectContaining({
        forwardedAuthCookies: 1,
      }),
    }))
  })

  it("redirects to sign-in error when auth succeeds without a session cookie", async () => {
    authHandlerPostMock.mockResolvedValue(new Response(JSON.stringify({ user: { id: "user-1" } }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }))

    const response = await GET(
      new Request("https://www.onrelay.app/api/integrations/google/callback?code=google-code&state=encrypted"),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://www.onrelay.app/sign-in?next=%2Fdashboard&intent=sign-up&google=error",
    )
    expect(response.headers.getSetCookie().join("\n")).not.toContain(SESSION_TOKEN_COOKIE_NAME)
    expect(logServerEventMock).toHaveBeenCalledWith(expect.objectContaining({
      event: "google_auth.callback_failed",
      context: expect.objectContaining({
        reason: "Auth sign-in completed without a session cookie.",
      }),
    }))
  })
})
