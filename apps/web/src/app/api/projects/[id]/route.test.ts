import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  withApiAuthMock,
  resolveViewerMock,
  requireViewerProjectMock,
  consumeMcpReadQuotaMock,
  getCachedProjectDashboardForUserMock,
  updateProjectForUserMock,
  deleteProjectForUserMock,
} = vi.hoisted(() => ({
  withApiAuthMock: vi.fn((handler: any) => handler),
  resolveViewerMock: vi.fn(),
  requireViewerProjectMock: vi.fn(),
  consumeMcpReadQuotaMock: vi.fn(),
  getCachedProjectDashboardForUserMock: vi.fn(),
  updateProjectForUserMock: vi.fn(),
  deleteProjectForUserMock: vi.fn(),
}))

vi.mock("@/server/http/api-route", () => ({ withApiAuth: withApiAuthMock }))
vi.mock("@/server/policies/viewer", () => ({ resolveViewer: resolveViewerMock, requireViewerProject: requireViewerProjectMock }))
vi.mock("@/server/services/entitlement-service", () => ({ consumeActionQuota: vi.fn(), consumeMcpReadQuota: consumeMcpReadQuotaMock, consumeMcpWriteQuota: vi.fn() }))
vi.mock("@/server/cache/read-model-cache", () => ({ getCachedProjectDashboardForUser: getCachedProjectDashboardForUserMock }))
vi.mock("@/server/services/project-service", () => ({
  updateProjectForUser: updateProjectForUserMock,
  deleteProjectForUser: deleteProjectForUserMock,
}))

import { GET } from "./route"

describe("GET /api/projects/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "session" })
  })

  it("serves dashboard reads through the server cache without public CDN caching", async () => {
    getCachedProjectDashboardForUserMock.mockResolvedValue({
      project: { id: "project-1", name: "Relay" },
      memory: [],
    })

    const response = await GET(new Request("http://relay.test/api/projects/project-1"), {
      params: Promise.resolve({ id: "project-1" }),
    })

    expect(requireViewerProjectMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), "project-1", "project:read")
    expect(getCachedProjectDashboardForUserMock).toHaveBeenCalledWith("user-1", "project-1")
    expect(String(response.headers.get("Cache-Control") ?? "")).not.toMatch(/public/i)
    expect(await response.json()).toEqual({
      project: { id: "project-1", name: "Relay" },
      dashboard: { project: { id: "project-1", name: "Relay" }, memory: [] },
    })
  })
})
