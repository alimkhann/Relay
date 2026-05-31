import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  ensurePersonalProjectForUserMock,
  getResolvedOnboardingStateForUserMock,
  getUserSettingsMock,
  listProjectsForUserMock,
  rejectMcpViewerMock,
  resolveViewerMock,
} = vi.hoisted(() => ({
  ensurePersonalProjectForUserMock: vi.fn(),
  getResolvedOnboardingStateForUserMock: vi.fn(),
  getUserSettingsMock: vi.fn(),
  listProjectsForUserMock: vi.fn(),
  rejectMcpViewerMock: vi.fn(),
  resolveViewerMock: vi.fn(),
}))

vi.mock("@/server/http/api-route", () => ({
  withApiAuth: (handler: (request: Request) => Promise<Response>) => handler,
}))

vi.mock("@/server/policies/viewer", () => ({
  rejectMcpViewer: rejectMcpViewerMock,
  resolveViewer: resolveViewerMock,
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

import { GET } from "./route"

describe("GET /api/extension/session", () => {
  beforeEach(() => {
    ensurePersonalProjectForUserMock.mockReset()
    getResolvedOnboardingStateForUserMock.mockReset()
    getUserSettingsMock.mockReset()
    listProjectsForUserMock.mockReset()
    rejectMcpViewerMock.mockReset()
    resolveViewerMock.mockReset()

    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "extension" })
    ensurePersonalProjectForUserMock.mockResolvedValue({
      id: "personal-1",
      name: "Personal",
      kind: "personal",
    })
    listProjectsForUserMock.mockResolvedValue([
      { id: "personal-1", name: "Personal", kind: "personal" },
      { id: "project-1", name: "Relay", kind: "project" },
    ])
    getUserSettingsMock.mockResolvedValue({ settings: { autoCapture: true } })
    getResolvedOnboardingStateForUserMock.mockResolvedValue({
      status: "completed",
      completedProjectId: "project-1",
      completedVia: "extension",
      completedAt: "2026-05-31T00:00:00.000Z",
    })
  })

  it("ensures personal exists before listing extension projects", async () => {
    const response = await GET(
      new Request("http://relay.test/api/extension/session", {
        headers: { authorization: "Bearer relay-token" },
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(ensurePersonalProjectForUserMock).toHaveBeenCalledWith("user-1")
    expect(listProjectsForUserMock).toHaveBeenCalledWith("user-1", {
      includePersonal: true,
    })
    const ensureCallOrder = ensurePersonalProjectForUserMock.mock.invocationCallOrder[0]
    const listCallOrder = listProjectsForUserMock.mock.invocationCallOrder[0]
    expect(ensureCallOrder).toBeDefined()
    expect(listCallOrder).toBeDefined()
    expect(ensureCallOrder!).toBeLessThan(listCallOrder!)
    expect(payload.projects[0]).toMatchObject({
      id: "personal-1",
      kind: "personal",
    })
    // The extension gates the "also save to" UI on this flag; default off.
    expect(payload.features).toEqual({ multiProjectCapture: false })
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
