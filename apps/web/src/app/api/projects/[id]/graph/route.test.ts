import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  withApiAuthMock,
  resolveViewerMock,
  requireViewerProjectMock,
  getCachedProjectGraphForUserMock,
} = vi.hoisted(() => ({
  withApiAuthMock: vi.fn((handler: any) => handler),
  resolveViewerMock: vi.fn(),
  requireViewerProjectMock: vi.fn(),
  getCachedProjectGraphForUserMock: vi.fn(),
}))

vi.mock("@/server/http/api-route", () => ({ withApiAuth: withApiAuthMock }))
vi.mock("@/server/policies/viewer", () => ({ resolveViewer: resolveViewerMock, requireViewerProject: requireViewerProjectMock }))
vi.mock("@/server/cache/read-model-cache", () => ({
  getCachedProjectGraphForUser: getCachedProjectGraphForUserMock,
}))

import { GET } from "./route"

describe("GET /api/projects/[id]/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "web" })
    getCachedProjectGraphForUserMock.mockResolvedValue({
      projectId: "project-1",
      density: "compact",
      includeEvidence: false,
      nodes: [],
      edges: [],
      stats: { nodeCount: 0, edgeCount: 0, isolatedNodeCount: 0, truncated: false },
    })
  })

  it("authorizes memory reads and returns a compact graph by default", async () => {
    const response = await GET(new Request("http://relay.test/api/projects/project-1/graph"), {
      params: Promise.resolve({ id: "project-1" }),
    })

    expect(requireViewerProjectMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), "project-1", "memory:read")
    expect(getCachedProjectGraphForUserMock).toHaveBeenCalledWith("user-1", "project-1", {
      density: "compact",
      includeEvidence: false,
    })
    expect(await response.json()).toEqual({
      projectId: "project-1",
      density: "compact",
      includeEvidence: false,
      nodes: [],
      edges: [],
      stats: { nodeCount: 0, edgeCount: 0, isolatedNodeCount: 0, truncated: false },
    })
  })

  it("accepts full density with explicit evidence", async () => {
    await GET(new Request("http://relay.test/api/projects/project-1/graph?density=full&includeEvidence=true"), {
      params: Promise.resolve({ id: "project-1" }),
    })

    expect(getCachedProjectGraphForUserMock).toHaveBeenCalledWith("user-1", "project-1", {
      density: "full",
      includeEvidence: true,
    })
  })
})
