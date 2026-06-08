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
vi.mock("@/server/services/memory-pipeline-scheduler", () => ({
  enqueuePersonalStateRegeneration: vi.fn(),
}))
vi.mock("@/server/services/personal-memory-service", () => ({
  routePersonalMemory: vi.fn(),
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
      limit: 11,
      sort: "updated_desc",
      cursor: null,
      types: ["decision", "task"],
    })
    expect(String(response.headers.get("Cache-Control") ?? "")).not.toMatch(/public/i)
    expect(await response.json()).toEqual({ memory: [{ id: "memory-1" }], nextCursor: null })
  })

  it("clamps hot-read limits and returns a stable next cursor", async () => {
    listCachedMemoryForExplainabilityMock.mockResolvedValue(
      Array.from({ length: 201 }, (_, index) => ({
        id: `memory-${index}`,
        pinned: false,
        updatedAt: new Date(2026, 0, 1, 0, index).toISOString(),
      })),
    )

    const response = await GET(new Request("http://relay.test/api/projects/project-1/memory?limit=999"), {
      params: Promise.resolve({ id: "project-1" }),
    })
    const body = await response.json()

    expect(listCachedMemoryForExplainabilityMock).toHaveBeenCalledWith("user-1", "project-1", expect.objectContaining({
      limit: 201,
      cursor: null,
    }))
    expect(body.memory).toHaveLength(200)
    expect(typeof body.nextCursor).toBe("string")
  })
})
