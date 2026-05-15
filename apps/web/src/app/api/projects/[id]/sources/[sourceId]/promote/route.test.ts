import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  promoteSourceCitationMock,
  consumeExternalSourceMcpActionQuotaMock,
  resolveViewerMock,
  requireViewerProjectMock,
  withApiAuthMock,
} = vi.hoisted(() => ({
  promoteSourceCitationMock: vi.fn(),
  consumeExternalSourceMcpActionQuotaMock: vi.fn(),
  resolveViewerMock: vi.fn(),
  requireViewerProjectMock: vi.fn(),
  withApiAuthMock: vi.fn((handler: any) => handler),
}))

vi.mock("@/server/http/api-route", () => ({ withApiAuth: withApiAuthMock }))
vi.mock("@/server/policies/viewer", () => ({ resolveViewer: resolveViewerMock, requireViewerProject: requireViewerProjectMock }))
vi.mock("@/server/services/entitlement-service", () => ({
  consumeExternalSourceMcpActionQuota: consumeExternalSourceMcpActionQuotaMock,
  consumeMcpWriteQuota: vi.fn(),
}))
vi.mock("@/server/services/source-service", () => ({ promoteSourceCitation: promoteSourceCitationMock }))

import { POST } from "./route"

describe("/api/projects/[id]/sources/[sourceId]/promote", () => {
  beforeEach(() => {
    promoteSourceCitationMock.mockReset()
    consumeExternalSourceMcpActionQuotaMock.mockReset()
    resolveViewerMock.mockReset()
    requireViewerProjectMock.mockReset()
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "web" })
  })

  it("promotes a selected source citation to memory", async () => {
    promoteSourceCitationMock.mockResolvedValue({ memoryItemId: "memory-1" })

    const response = await POST(new Request("http://relay.test/api/projects/project-1/sources/source-1/promote", {
      method: "POST",
      body: JSON.stringify({
        chunkId: "11111111-1111-1111-8111-111111111111",
        type: "note",
        content: "Useful citation",
      }),
    }), {
      params: Promise.resolve({ id: "project-1", sourceId: "source-1" }),
    })

    expect(requireViewerProjectMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), "project-1", "memory:write")
    expect(promoteSourceCitationMock).toHaveBeenCalledWith("user-1", "project-1", "source-1", expect.objectContaining({
      content: "Useful citation",
    }))
    expect(await response.json()).toEqual({ memoryItemId: "memory-1" })
  })
})
