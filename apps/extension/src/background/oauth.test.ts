import { afterEach, describe, expect, it, vi } from "vitest"

import { requestGoogleIdentityTokens } from "./oauth"

describe("requestGoogleIdentityTokens", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("throws a clear error when the Google client id is not configured", async () => {
    vi.stubEnv("PLASMO_PUBLIC_CRX_GOOGLE_CLIENT_ID", "")
    await expect(
      requestGoogleIdentityTokens({ interactive: true, prompt: "select_account" }),
    ).rejects.toThrow("Google sign-in is not configured")
  })
})
