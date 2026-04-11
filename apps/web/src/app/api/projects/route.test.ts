import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  withApiAuthMock,
  consumeMcpReadQuotaMock,
  resolveViewerMock,
  requireViewerScopeMock,
  rejectMcpViewerMock,
  listProjectsForUserMock,
  createProjectForUserMock,
  getResolvedOnboardingStateForUserMock,
} = vi.hoisted(() => ({
  withApiAuthMock: vi.fn((handler: (request: Request) => Promise<Response>) => handler),
  consumeMcpReadQuotaMock: vi.fn(),
  resolveViewerMock: vi.fn(),
  requireViewerScopeMock: vi.fn(),
  rejectMcpViewerMock: vi.fn(),
  listProjectsForUserMock: vi.fn(),
  createProjectForUserMock: vi.fn(),
  getResolvedOnboardingStateForUserMock: vi.fn(),
}))

vi.mock("@/server/http/api-route", () => ({
  withApiAuth: withApiAuthMock,
}))

vi.mock("@/server/services/entitlement-service", () => ({
  consumeMcpReadQuota: consumeMcpReadQuotaMock,
}))

vi.mock("@/server/policies/viewer", () => ({
  resolveViewer: resolveViewerMock,
  requireViewerScope: requireViewerScopeMock,
  rejectMcpViewer: rejectMcpViewerMock,
}))

vi.mock("@/server/services/project-service", () => ({
  listProjectsForUser: listProjectsForUserMock,
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
    listProjectsForUserMock.mockReset()
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
    listProjectsForUserMock.mockResolvedValue([
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
    expect(payload).toEqual({
      projects: [
        { id: "project-current", name: "Relay", slug: "relay" },
        { id: "project-other", name: "Another Project", slug: "another-project" },
      ],
    })
  })
})
