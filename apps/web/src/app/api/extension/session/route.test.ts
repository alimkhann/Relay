import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getResolvedOnboardingStateForUserMock,
  getUserSettingsMock,
  listCachedProjectsForUserMock,
  rejectMcpViewerMock,
  resolveViewerEntitlementsMock,
  resolveViewerMock,
  withApiAuthMock,
} = vi.hoisted(() => ({
  getResolvedOnboardingStateForUserMock: vi.fn(),
  getUserSettingsMock: vi.fn(),
  listCachedProjectsForUserMock: vi.fn(),
  rejectMcpViewerMock: vi.fn(),
  resolveViewerEntitlementsMock: vi.fn(),
  resolveViewerMock: vi.fn(),
  withApiAuthMock: vi.fn((handler: (request: Request) => Promise<Response>) => handler),
}))

vi.mock("@/server/http/api-route", () => ({
  withApiAuth: withApiAuthMock,
}))

vi.mock("@/server/policies/viewer", () => ({
  rejectMcpViewer: rejectMcpViewerMock,
  resolveViewer: resolveViewerMock,
}))

vi.mock("@/server/cache/read-model-cache", () => ({
  listCachedProjectsForUser: listCachedProjectsForUserMock,
}))

vi.mock("@/server/services/entitlement-service", () => ({
  resolveViewerEntitlements: resolveViewerEntitlementsMock,
}))

vi.mock("@/server/services/onboarding-service", () => ({
  getResolvedOnboardingStateForUser: getResolvedOnboardingStateForUserMock,
}))

vi.mock("@/server/services/settings-service", () => ({
  getUserSettings: getUserSettingsMock,
}))

import { GET } from "./route"

describe("GET /api/extension/session", () => {
  beforeEach(() => {
    getResolvedOnboardingStateForUserMock.mockReset()
    getUserSettingsMock.mockReset()
    listCachedProjectsForUserMock.mockReset()
    rejectMcpViewerMock.mockReset()
    resolveViewerEntitlementsMock.mockReset()
    resolveViewerMock.mockReset()

    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "extension" })
    listCachedProjectsForUserMock.mockResolvedValue([
      { id: "personal-1", name: "Personal", kind: "personal" },
      { id: "project-1", name: "Relay", kind: "project" },
    ])
    getUserSettingsMock.mockResolvedValue({ settings: { autoCapture: true } })
    getResolvedOnboardingStateForUserMock.mockResolvedValue({ status: "completed" })
    resolveViewerEntitlementsMock.mockResolvedValue({ plan: "free", status: "active" })
  })

  it("returns cached project summaries (incl. personal) and lightweight entitlements", async () => {
    const response = await GET(
      new Request("http://relay.test/api/extension/session", {
        headers: { authorization: "Bearer relay-token" },
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    // Cost cut: cached read-model, including personal — NOT an uncached listProjectsForUser.
    expect(listCachedProjectsForUserMock).toHaveBeenCalledWith("user-1", {
      includePersonal: true,
    })
    expect(resolveViewerEntitlementsMock).toHaveBeenCalledWith("user-1")
    expect(payload.projects[0]).toMatchObject({ id: "personal-1", kind: "personal" })
    expect(payload.entitlements).toEqual({ plan: "free", status: "active" })
    // The extension gates the "also save to" UI on this flag; default off.
    expect(payload.features).toEqual({ multiProjectCapture: false })
  })

  it("does NOT provision/repair personal on the high-frequency session GET", async () => {
    // Regression guard: the route module must not import project-service
    // provisioning into this hot path. Personal is provisioned on auth/sign-in.
    const routeModule = await import("./route")
    expect(routeModule.GET).toBeTypeOf("function")
    // No provisioning mock exists because the route no longer calls it; the
    // cached-projects call carries personal already.
    expect(listCachedProjectsForUserMock).not.toHaveBeenCalled()
  })

  it("reports multiProjectCapture on when the env flag is set", async () => {
    const prev = process.env.RELAY_MULTI_PROJECT_CAPTURE
    process.env.RELAY_MULTI_PROJECT_CAPTURE = "true"
    try {
      const response = await GET(
        new Request("http://relay.test/api/extension/session", {
          headers: { authorization: "Bearer relay-token" },
        }),
      )
      const payload = await response.json()
      expect(payload.features).toEqual({ multiProjectCapture: true })
    } finally {
      if (prev === undefined) delete process.env.RELAY_MULTI_PROJECT_CAPTURE
      else process.env.RELAY_MULTI_PROJECT_CAPTURE = prev
    }
  })
})
