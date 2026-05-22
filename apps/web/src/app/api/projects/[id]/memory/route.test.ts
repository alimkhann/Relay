import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  withApiAuthMock,
  resolveViewerMock,
  requireViewerProjectMock,
  listCachedMemoryForExplainabilityMock,
} = vi.hoisted(() => ({
  withApiAuthMock: vi.fn((handler: any) => handler),
  resolveViewerMock: vi.fn(),
  requireViewerProjectMock: vi.fn(),
  listCachedMemoryForExplainabilityMock: vi.fn(),
}))

vi.mock("@/server/http/api-route", () => ({ withApiAuth: withApiAuthMock }))
vi.mock("@/server/policies/viewer", () => ({ resolveViewer: resolveViewerMock, requireViewerProject: requireViewerProjectMock }))
vi.mock("@/server/services/entitlement-service", () => ({
  consumeExtensionMemoryWriteQuota: vi.fn(),
  consumeMcpReadQuota: vi.fn(),
  consumeMcpWriteQuota: vi.fn(),
}))
vi.mock("@/server/cache/read-model-cache", () => ({
  listCachedMemoryForExplainability: listCachedMemoryForExplainabilityMock,
}))
vi.mock("@/server/services/memory-service", () => ({
  createMemoryItem: vi.fn(),
}))

import { GET } from "./route"

describe("GET /api/projects/[id]/memory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "session" })
  })

  it("normalizes query options and reads through the server cache", async () => {
    listCachedMemoryForExplainabilityMock.mockResolvedValue([{ id: "memory-1" }])

    const response = await GET(new Request("http://relay.test/api/projects/project-1/memory?type=task&type=decision&limit=10"), {
      params: Promise.resolve({ id: "project-1" }),
    })

    expect(requireViewerProjectMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), "project-1", "memory:read")
    expect(listCachedMemoryForExplainabilityMock).toHaveBeenCalledWith("user-1", "project-1", {
      archived: false,
      pinned: undefined,
      tag: undefined,
      limit: 10,
      sort: "updated_desc",
      types: ["decision", "task"],
    })
    expect(String(response.headers.get("Cache-Control") ?? "")).not.toMatch(/public/i)
    expect(await response.json()).toEqual({ memory: [{ id: "memory-1" }] })
  })
})
