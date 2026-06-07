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
  })

  it("returns cached project summaries and lightweight entitlements", async () => {
    const projects = [{ id: "project-1", name: "Relay" }]
    const settings = { settings: { autoCapture: true } }
    const onboarding = { status: "completed" }
    const entitlements = { plan: "free", status: "active" }
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "extension" })
    listCachedProjectsForUserMock.mockResolvedValue(projects)
    getUserSettingsMock.mockResolvedValue(settings)
    getResolvedOnboardingStateForUserMock.mockResolvedValue(onboarding)
    resolveViewerEntitlementsMock.mockResolvedValue(entitlements)

    const response = await GET(new Request("http://relay.test/api/extension/session"))

    await expect(response.json()).resolves.toEqual({
      userId: "user-1",
      projects,
      settings,
      onboarding,
      entitlements,
    })
    expect(listCachedProjectsForUserMock).toHaveBeenCalledWith("user-1")
    expect(resolveViewerEntitlementsMock).toHaveBeenCalledWith("user-1")
  })
})
