import { beforeEach, describe, expect, it, vi } from "vitest"

const { encryptSecretMock } = vi.hoisted(() => ({
  encryptSecretMock: vi.fn((value: string) => `encrypted:${value}`),
}))

vi.mock("@/server/lib/secret-crypto", () => ({
  encryptSecret: encryptSecretMock,
}))

import { GET } from "./route"

describe("Google auth start route", () => {
  beforeEach(() => {
    encryptSecretMock.mockClear()
    vi.stubEnv("GOOGLE_INTEGRATION_CLIENT_ID", "google-client-id")
    vi.stubEnv("GOOGLE_INTEGRATION_CLIENT_SECRET", "google-client-secret")
  })

  it("redirects to Google with account selection forced", async () => {
    const response = await GET(
      new Request("https://www.onrelay.app/api/auth/google/start?next=/dashboard&intent=sign-up"),
    )

    const location = response.headers.get("location")
    expect(location).toBeTruthy()
    const url = new URL(location!)
    expect(url.origin).toBe("https://accounts.google.com")
    expect(url.pathname).toBe("/o/oauth2/v2/auth")
    expect(url.searchParams.get("client_id")).toBe("google-client-id")
    expect(url.searchParams.get("redirect_uri")).toBe("https://www.onrelay.app/api/integrations/google/callback")
    expect(url.searchParams.get("scope")).toBe("openid email profile")
    expect(url.searchParams.get("prompt")).toBe("select_account")
    expect(url.searchParams.get("state")).toMatch(/^encrypted:/)

    const statePayload = JSON.parse(encryptSecretMock.mock.calls[0]![0])
    expect(statePayload).toMatchObject({
      mode: "auth",
      nextPath: "/dashboard",
      intent: "sign-up",
    })
    expect(typeof statePayload.ts).toBe("number")
  })
})
