import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  createExtensionTokenForUserMock,
  ensurePersonalProjectForUserMock,
  getResolvedOnboardingStateForUserMock,
  getUserSettingsMock,
  listProjectsForUserMock,
  resolveGoogleAuthUserMock,
} = vi.hoisted(() => ({
  createExtensionTokenForUserMock: vi.fn(),
  ensurePersonalProjectForUserMock: vi.fn(),
  getResolvedOnboardingStateForUserMock: vi.fn(),
  getUserSettingsMock: vi.fn(),
  listProjectsForUserMock: vi.fn(),
  resolveGoogleAuthUserMock: vi.fn(),
}))

vi.mock("@/server/http/extension-cors", () => ({
  applyExtensionCorsHeaders: (response: Response) => response,
  buildExtensionPreflightResponse: () => new Response(null, { status: 204 }),
}))

vi.mock("@/server/logging/logger", () => ({
  logServerEvent: vi.fn(),
}))

vi.mock("@/server/logging/request-context", () => ({
  getRequestContext: () => ({ requestId: "req-test", flowId: "flow-test" }),
  withRequestContext: (_request: Request, handler: () => Promise<Response>) => handler(),
}))

vi.mock("@/server/services/rate-limit-service", () => ({
  assertIpRateLimit: vi.fn(),
}))

vi.mock("@/server/services/google-auth-service", () => ({
  resolveGoogleAuthUser: resolveGoogleAuthUserMock,
}))

vi.mock("@/server/services/onboarding-service", () => ({
  getResolvedOnboardingStateForUser: getResolvedOnboardingStateForUserMock,
}))

vi.mock("@/server/services/project-service", () => ({
  ensurePersonalProjectForUser: ensurePersonalProjectForUserMock,
  listProjectsForUser: listProjectsForUserMock,
}))

vi.mock("@/server/services/settings-service", () => ({
  getUserSettings: getUserSettingsMock,
}))

vi.mock("@/server/services/extension-token-service", () => ({
  createExtensionTokenForUser: createExtensionTokenForUserMock,
}))

import { POST } from "./route"

describe("POST /api/extension/auth/google", () => {
  beforeEach(() => {
    createExtensionTokenForUserMock.mockReset()
    ensurePersonalProjectForUserMock.mockReset()
    getResolvedOnboardingStateForUserMock.mockReset()
    getUserSettingsMock.mockReset()
    listProjectsForUserMock.mockReset()
    resolveGoogleAuthUserMock.mockReset()
    vi.unstubAllEnvs()
    vi.stubEnv("AUTH_PROVIDER", "local")
    vi.stubEnv("NEXT_PUBLIC_RELAY_APP_URL", "http://localhost:3000")

    resolveGoogleAuthUserMock.mockResolvedValue({
      authUser: { id: "user-1", email: "ada@example.com", name: "Ada" },
      googleUser: { sub: "google-1", email: "ada@example.com" },
      isNewUser: false,
    })
    createExtensionTokenForUserMock.mockResolvedValue({ token: "relay-token" })
    ensurePersonalProjectForUserMock.mockResolvedValue(null)
    listProjectsForUserMock.mockResolvedValue([
      { id: "personal-1", name: "Personal", kind: "personal" },
      { id: "project-1", name: "Relay", kind: "project" },
    ])
    getResolvedOnboardingStateForUserMock.mockResolvedValue({
      status: "completed",
      completedProjectId: "project-1",
      completedVia: "extension",
      completedAt: "2026-05-31T00:00:00.000Z",
    })
    getUserSettingsMock.mockResolvedValue({
      settings: { defaultTargetProfileKey: "chatgpt_planning" },
    })
  })

  it("issues an extension session for Google auth even in local mode", async () => {
    const response = await POST(
      new Request("http://relay.test/api/extension/auth/google", {
        method: "POST",
        headers: { origin: "chrome-extension://abc123" },
        body: JSON.stringify({
          googleAccessToken: "access-token",
          googleIdToken: "id-token",
          deviceName: "Chrome Extension",
        }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(resolveGoogleAuthUserMock).toHaveBeenCalledWith({
      googleAccessToken: "access-token",
      googleIdToken: "id-token",
      flowId: "flow-test",
      allowProvisionFallback: true,
    })
    expect(createExtensionTokenForUserMock).toHaveBeenCalledWith("user-1", {
      deviceName: "Chrome Extension",
    })
    expect(payload).toMatchObject({
      token: "relay-token",
      apiBase: "http://localhost:3000",
      userId: "user-1",
      projectId: "project-1",
    })
    expect(payload.projects[0]).toMatchObject({ kind: "personal" })
  })
})
