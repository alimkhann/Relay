import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { encryptSecretMock, googleClientMock, isGoogleConfiguredMock } = vi.hoisted(() => ({
  encryptSecretMock: vi.fn(),
  googleClientMock: vi.fn(),
  isGoogleConfiguredMock: vi.fn(),
}))

vi.mock("@/server/lib/secret-crypto", () => ({
  encryptSecret: encryptSecretMock,
}))

vi.mock("@/server/services/integrations/google-service", () => ({
  getGoogleIntegrationClient: googleClientMock,
  isGoogleIntegrationConfigured: isGoogleConfiguredMock,
}))

describe("Google auth start route", () => {
  beforeEach(() => {
    encryptSecretMock.mockReset()
    googleClientMock.mockReset()
    isGoogleConfiguredMock.mockReset()

    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-24T09:45:00.000Z"))
    encryptSecretMock.mockImplementation((value: string) => `encrypted:${value}`)
    googleClientMock.mockReturnValue({
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
    })
    isGoogleConfiguredMock.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("redirects to Google with Relay auth state and forced account selection", async () => {
    const { GET } = await import("./route")

    const response = await GET(
      new Request("https://www.onrelay.app/api/auth/google/start?next=/dashboard&intent=sign-up"),
    )

    expect(encryptSecretMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(encryptSecretMock.mock.calls[0]![0])).toEqual({
      mode: "auth",
      nextPath: "/dashboard",
      intent: "sign-up",
      ts: Date.parse("2026-06-24T09:45:00.000Z"),
    })

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get("location")!)
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth")
    expect(location.searchParams.get("client_id")).toBe("google-client-id")
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://www.onrelay.app/api/integrations/google/callback",
    )
    expect(location.searchParams.get("response_type")).toBe("code")
    expect(location.searchParams.get("scope")).toBe("openid email profile")
    expect(location.searchParams.get("prompt")).toBe("select_account")
    expect(location.searchParams.get("state")).toContain("encrypted:")
  })

  it("redirects back to the matching sign-up screen when Google OAuth is unavailable", async () => {
    isGoogleConfiguredMock.mockReturnValue(false)
    const { GET } = await import("./route")

    const response = await GET(
      new Request("https://www.onrelay.app/api/auth/google/start?next=/dashboard&intent=sign-up"),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://www.onrelay.app/sign-in?next=%2Fdashboard&intent=sign-up&google=error",
    )
  })
})
