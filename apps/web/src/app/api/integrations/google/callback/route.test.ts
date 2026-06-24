import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  authPostMock,
  decryptSecretMock,
  exchangeGoogleAuthCodeMock,
  logServerEventMock,
} = vi.hoisted(() => ({
  authPostMock: vi.fn(),
  decryptSecretMock: vi.fn(),
  exchangeGoogleAuthCodeMock: vi.fn(),
  logServerEventMock: vi.fn(),
}))

vi.mock("@/lib/auth/server", () => ({
  requireAuthServer: () => ({
    handler: () => ({
      POST: authPostMock,
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
    authPostMock.mockReset()
    decryptSecretMock.mockReset()
    exchangeGoogleAuthCodeMock.mockReset()
    logServerEventMock.mockReset()

    decryptSecretMock.mockImplementation(() => authState())
    exchangeGoogleAuthCodeMock.mockResolvedValue({
      id_token: "google-id-token",
      access_token: "google-access-token",
    })
  })

  it("sets a Neon session cookie when ID-token sign-in returns a token without Set-Cookie", async () => {
    authPostMock.mockResolvedValue(Response.json({
      token: "neon-session-token",
      session: {
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      user: {
        id: "user-1",
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

    const signInRequest = authPostMock.mock.calls[0]![0] as Request
    expect(await signInRequest.json()).toMatchObject({
      provider: "google",
      disableRedirect: true,
      requestSignUp: true,
      idToken: {
        token: "google-id-token",
        accessToken: "google-access-token",
      },
    })
  })

  it("redirects back to sign-in when Neon returns neither a cookie nor a token", async () => {
    authPostMock.mockResolvedValue(Response.json({
      user: {
        id: "user-1",
      },
    }))

    const response = await GET(
      new Request("https://www.onrelay.app/api/integrations/google/callback?code=google-code&state=encrypted"),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://www.onrelay.app/sign-in?next=%2Fdashboard&intent=sign-up&google=error",
    )
    expect(logServerEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "google_auth.callback_failed",
      }),
    )
  })
})
