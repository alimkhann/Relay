import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  resolveViewerMock,
  requireViewerProjectMock,
  searchProjectSourcesMock,
  consumeExternalSourceMcpActionQuotaMock,
  withApiAuthMock,
} = vi.hoisted(() => ({
  resolveViewerMock: vi.fn(),
  requireViewerProjectMock: vi.fn(),
  searchProjectSourcesMock: vi.fn(),
  consumeExternalSourceMcpActionQuotaMock: vi.fn(),
  withApiAuthMock: vi.fn((handler: any) => handler),
}))

vi.mock("@/server/http/api-route", () => ({ withApiAuth: withApiAuthMock }))
vi.mock("@/server/policies/viewer", () => ({ resolveViewer: resolveViewerMock, requireViewerProject: requireViewerProjectMock }))
vi.mock("@/server/services/entitlement-service", () => ({
  consumeExternalSourceMcpActionQuota: consumeExternalSourceMcpActionQuotaMock,
  consumeMcpReadQuota: vi.fn(),
}))
vi.mock("@/server/services/source-service", () => ({ searchProjectSources: searchProjectSourcesMock }))

import { POST } from "./route"

describe("/api/projects/[id]/sources/search", () => {
  beforeEach(() => {
    resolveViewerMock.mockReset()
    requireViewerProjectMock.mockReset()
    searchProjectSourcesMock.mockReset()
    consumeExternalSourceMcpActionQuotaMock.mockReset()
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "web" })
  })

  it("searches sources explicitly and returns cited results", async () => {
    searchProjectSourcesMock.mockResolvedValue({ results: [{ sourceId: "source-1", content: "Match" }] })

    const response = await POST(new Request("http://relay.test/api/projects/project-1/sources/search", {
      method: "POST",
      body: JSON.stringify({ query: "research", kinds: ["external_docs"] }),
    }), {
      params: Promise.resolve({ id: "project-1" }),
    })

    expect(requireViewerProjectMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), "project-1", "memory:read")
    expect(searchProjectSourcesMock).toHaveBeenCalledWith("user-1", "project-1", expect.objectContaining({ query: "research" }))
    expect(await response.json()).toEqual({ results: [{ sourceId: "source-1", content: "Match" }] })
  })
})
