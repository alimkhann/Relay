import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  authHandlerPostMock,
  createNeonAuthSessionMock,
  decryptSecretMock,
  exchangeGoogleAuthCodeMock,
  logServerEventMock,
  resolveOrProvisionAuthUserMock,
  verifyGoogleIdentityMock,
} = vi.hoisted(() => ({
  authHandlerPostMock: vi.fn(),
  createNeonAuthSessionMock: vi.fn(),
  decryptSecretMock: vi.fn(),
  exchangeGoogleAuthCodeMock: vi.fn(),
  logServerEventMock: vi.fn(),
  resolveOrProvisionAuthUserMock: vi.fn(),
  verifyGoogleIdentityMock: vi.fn(),
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

vi.mock("@/server/services/google-auth-service", () => ({
  createNeonAuthSession: createNeonAuthSessionMock,
  resolveOrProvisionAuthUser: resolveOrProvisionAuthUserMock,
  verifyGoogleIdentity: verifyGoogleIdentityMock,
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
    createNeonAuthSessionMock.mockReset()
    decryptSecretMock.mockReset()
    exchangeGoogleAuthCodeMock.mockReset()
    logServerEventMock.mockReset()
    resolveOrProvisionAuthUserMock.mockReset()
    verifyGoogleIdentityMock.mockReset()

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
    verifyGoogleIdentityMock.mockResolvedValue({ sub: "google-1", email: "user@example.com" })
    resolveOrProvisionAuthUserMock.mockResolvedValue({ id: "user-1", email: "user@example.com" })
    createNeonAuthSessionMock.mockRejectedValue(new Error("Manual session fallback failed."))

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
        reason: "Manual session fallback failed.",
      }),
    }))
  })

  it("sets a session cookie from the Neon auth token header when no cookie is returned", async () => {
    authHandlerPostMock.mockResolvedValue(new Response(JSON.stringify({ user: { id: "user-1" } }), {
      status: 200,
      headers: {
        "set-auth-jwt": "neon-session-token-from-header",
      },
    }))

    const response = await GET(
      new Request("https://www.onrelay.app/api/integrations/google/callback?code=google-code&state=encrypted"),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://www.onrelay.app/dashboard")
    expect(response.headers.getSetCookie().join("\n")).toContain(
      "__Secure-neon-auth.session_token=neon-session-token-from-header",
    )
    expect(logServerEventMock).toHaveBeenCalledWith(expect.objectContaining({
      event: "google_auth.callback_session_established",
      context: expect.objectContaining({
        usedAuthHeaderFallback: true,
      }),
    }))
  })

  it("sets a session cookie from the auth response token body when no cookie or token header is returned", async () => {
    authHandlerPostMock.mockResolvedValue(new Response(JSON.stringify({
      token: "neon-session-token-from-body",
      user: { id: "user-1" },
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }))

    const response = await GET(
      new Request("https://www.onrelay.app/api/integrations/google/callback?code=google-code&state=encrypted"),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://www.onrelay.app/dashboard")
    expect(response.headers.getSetCookie().join("\n")).toContain(
      "__Secure-neon-auth.session_token=neon-session-token-from-body",
    )
    expect(logServerEventMock).toHaveBeenCalledWith(expect.objectContaining({
      event: "google_auth.callback_session_established",
      context: expect.objectContaining({
        usedAuthBodyFallback: true,
      }),
    }))
  })

  it("creates a Neon Auth session when the auth response succeeds without token material", async () => {
    authHandlerPostMock.mockResolvedValue(new Response(JSON.stringify({ user: { id: "user-1" } }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }))
    verifyGoogleIdentityMock.mockResolvedValue({ sub: "google-1", email: "user@example.com" })
    resolveOrProvisionAuthUserMock.mockResolvedValue({ id: "user-1", email: "user@example.com" })
    createNeonAuthSessionMock.mockResolvedValue({
      token: "manual-session-token",
      expiresAt: new Date(Date.now() + 3_600_000),
    })

    const response = await GET(
      new Request("https://www.onrelay.app/api/integrations/google/callback?code=google-code&state=encrypted", {
        headers: {
          "user-agent": "Comet",
          "x-forwarded-for": "203.0.113.7, 10.0.0.1",
        },
      }),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://www.onrelay.app/dashboard")
    const setCookies = response.headers.getSetCookie().join("\n")
    expect(setCookies).toContain("__Secure-neon-auth.session_token=manual-session-token")
    expect(setCookies).toContain("Domain=.onrelay.app")
    expect(verifyGoogleIdentityMock).toHaveBeenCalledWith("google-access-token")
    expect(resolveOrProvisionAuthUserMock).toHaveBeenCalledWith({
      googleUser: { sub: "google-1", email: "user@example.com" },
    })
    expect(createNeonAuthSessionMock).toHaveBeenCalledWith({
      userId: "user-1",
      ipAddress: "203.0.113.7",
      userAgent: "Comet",
    })
    expect(logServerEventMock).toHaveBeenCalledWith(expect.objectContaining({
      event: "google_auth.callback_session_established",
      context: expect.objectContaining({
        usedManualSessionFallback: true,
      }),
    }))
  })
})
