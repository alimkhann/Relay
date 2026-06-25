import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  authGetMock,
  clearLocalSessionCookieFromResponseMock,
  deleteAccountForUserMock,
  getAuthProviderMock,
  profileGetByIdMock,
  providerQueryMock,
  requireSessionViewerMock,
  sendAccountDeletedEmailMock,
} = vi.hoisted(() => ({
  authGetMock: vi.fn(),
  clearLocalSessionCookieFromResponseMock: vi.fn((response: Response) => response),
  deleteAccountForUserMock: vi.fn(),
  getAuthProviderMock: vi.fn(),
  profileGetByIdMock: vi.fn(),
  providerQueryMock: vi.fn(),
  requireSessionViewerMock: vi.fn(),
  sendAccountDeletedEmailMock: vi.fn(),
}))

vi.mock("@relay/db", () => ({
  createServiceRepositoryBundle: () => ({
    profiles: {
      getById: profileGetByIdMock,
    },
    provider: {
      query: providerQueryMock,
    },
  }),
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
    }),
  }),
}))

vi.mock("@/server/http/api-route", () => ({
  withApiAuth: (handler: (request: Request) => Promise<Response>) => handler,
}))

vi.mock("@/server/policies/viewer", () => ({
  requireSessionViewer: requireSessionViewerMock,
}))

vi.mock("@/server/services/account-deletion-service", () => ({
  deleteAccountForUser: deleteAccountForUserMock,
}))

vi.mock("@/server/services/email-service", () => ({
  sendAccountDeletedEmail: sendAccountDeletedEmailMock,
}))

vi.mock("@/server/services/rate-limit-service", () => ({
  assertIpRateLimit: vi.fn(),
}))

import { POST } from "./route"

describe("account deletion route", () => {
  beforeEach(() => {
    authGetMock.mockReset()
    clearLocalSessionCookieFromResponseMock.mockReset()
    clearLocalSessionCookieFromResponseMock.mockImplementation((response: Response) => response)
    deleteAccountForUserMock.mockReset()
    getAuthProviderMock.mockReset()
    profileGetByIdMock.mockReset()
    providerQueryMock.mockReset()
    requireSessionViewerMock.mockReset()
    sendAccountDeletedEmailMock.mockReset()

    getAuthProviderMock.mockReturnValue("neon")
    profileGetByIdMock.mockResolvedValue({
      email: "ada@example.com",
      displayName: "Ada",
    })
    requireSessionViewerMock.mockResolvedValue({
      userId: "user-1",
      email: "ada@example.com",
      name: "Ada",
    })
  })

  it("deletes a Google-linked account without returning an external logout URL", async () => {
    authGetMock.mockResolvedValue(Response.json([
      {
        id: "account-1",
        providerId: "google",
      },
    ]))

    const response = await POST(new Request("https://www.onrelay.app/api/account/delete", {
      method: "POST",
      headers: {
        Cookie: "__Secure-neon-auth.session_token=session-1",
      },
    }))

    expect(authGetMock).not.toHaveBeenCalled()
    expect(deleteAccountForUserMock).toHaveBeenCalledWith("user-1")

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    const setCookies = response.headers.getSetCookie().join("\n")
    expect(setCookies).toContain("__Secure-neon-auth.session_token=;")
    expect(setCookies).toContain("Domain=.onrelay.app")
  })

  it("omits Google logout when deleting a non-Google account", async () => {
    authGetMock.mockResolvedValue(Response.json([
      {
        id: "account-1",
        providerId: "credential",
      },
    ]))

    const response = await POST(new Request("https://www.onrelay.app/api/account/delete", {
      method: "POST",
      headers: {
        Cookie: "__Secure-neon-auth.session_token=session-1",
      },
    }))

    expect(deleteAccountForUserMock).toHaveBeenCalledWith("user-1")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
})
