import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  withApiAuthMock,
  consumeMcpReadQuotaMock,
  resolveViewerMock,
  requireViewerScopeMock,
  rejectMcpViewerMock,
  listCachedProjectsForUserMock,
  createProjectForUserMock,
  getResolvedOnboardingStateForUserMock,
} = vi.hoisted(() => ({
  withApiAuthMock: vi.fn((handler: (request: Request) => Promise<Response>) => handler),
  consumeMcpReadQuotaMock: vi.fn(),
  resolveViewerMock: vi.fn(),
  requireViewerScopeMock: vi.fn(),
  rejectMcpViewerMock: vi.fn(),
  listCachedProjectsForUserMock: vi.fn(),
  createProjectForUserMock: vi.fn(),
  getResolvedOnboardingStateForUserMock: vi.fn(),
}))

vi.mock("@/server/http/api-route", () => ({
  withApiAuth: withApiAuthMock,
}))

vi.mock("@/server/services/entitlement-service", () => ({
  consumeActionQuota: vi.fn(),
  consumeMcpReadQuota: consumeMcpReadQuotaMock,
}))

vi.mock("@/server/policies/viewer", () => ({
  resolveViewer: resolveViewerMock,
  requireViewerScope: requireViewerScopeMock,
  rejectMcpViewer: rejectMcpViewerMock,
}))

vi.mock("@/server/cache/read-model-cache", () => ({
  listCachedProjectsForUser: listCachedProjectsForUserMock,
}))

vi.mock("@/server/services/project-service", () => ({
  createProjectForUser: createProjectForUserMock,
}))

vi.mock("@/server/services/onboarding-service", () => ({
  getResolvedOnboardingStateForUser: getResolvedOnboardingStateForUserMock,
}))

import { GET } from "./route"

describe("GET /api/projects", () => {
  beforeEach(() => {
    consumeMcpReadQuotaMock.mockReset()
    resolveViewerMock.mockReset()
    requireViewerScopeMock.mockReset()
    rejectMcpViewerMock.mockReset()
    listCachedProjectsForUserMock.mockReset()
    createProjectForUserMock.mockReset()
    getResolvedOnboardingStateForUserMock.mockReset()
  })

  it("returns all projects for an MCP viewer so project switching can recover", async () => {
    resolveViewerMock.mockResolvedValue({
      userId: "user-1",
      mode: "mcp",
      projectId: "project-current",
      scopes: ["project:read"],
    })
    listCachedProjectsForUserMock.mockResolvedValue([
      { id: "project-current", name: "Relay", slug: "relay" },
      { id: "project-other", name: "Another Project", slug: "another-project" },
    ])

    const response = await GET(new Request("http://relay.test/api/projects"))
    const payload = await response.json()

    expect(requireViewerScopeMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "mcp", userId: "user-1" }),
      "project:read",
    )
    expect(consumeMcpReadQuotaMock).toHaveBeenCalledWith("user-1")
    expect(listCachedProjectsForUserMock).toHaveBeenCalledWith("user-1", { includePersonal: false })
    expect(payload).toEqual({
      projects: [
        { id: "project-current", name: "Relay", slug: "relay" },
        { id: "project-other", name: "Another Project", slug: "another-project" },
      ],
    })
  })
})
