import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  createExternalSourceMock,
  consumeExternalSourceMcpActionQuotaMock,
  resolveViewerMock,
  requireViewerProjectMock,
  withApiAuthMock,
} = vi.hoisted(() => ({
  createExternalSourceMock: vi.fn(),
  consumeExternalSourceMcpActionQuotaMock: vi.fn(),
  resolveViewerMock: vi.fn(),
  requireViewerProjectMock: vi.fn(),
  withApiAuthMock: vi.fn((handler: any) => handler),
}))

vi.mock("@/server/http/api-route", () => ({ withApiAuth: withApiAuthMock }))
vi.mock("@/server/policies/viewer", () => ({ resolveViewer: resolveViewerMock, requireViewerProject: requireViewerProjectMock }))
vi.mock("@/server/services/entitlement-service", () => ({
  consumeActionQuota: vi.fn(),
  consumeExternalSourceMcpActionQuota: consumeExternalSourceMcpActionQuotaMock,
  consumeMcpWriteQuota: vi.fn(),
}))
vi.mock("@/server/services/source-service", () => ({ createExternalSource: createExternalSourceMock }))

import { POST } from "./route"

describe("/api/projects/[id]/sources/external", () => {
  beforeEach(() => {
    createExternalSourceMock.mockReset()
    consumeExternalSourceMcpActionQuotaMock.mockReset()
    resolveViewerMock.mockReset()
    requireViewerProjectMock.mockReset()
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "web" })
  })

  it("creates an external source from a public URL", async () => {
    createExternalSourceMock.mockResolvedValue({ source: { id: "source-1" } })

    const response = await POST(new Request("http://relay.test/api/projects/project-1/sources/external", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/docs", sourceType: "website" }),
    }), {
      params: Promise.resolve({ id: "project-1" }),
    })

    expect(requireViewerProjectMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), "project-1", "memory:write")
    expect(createExternalSourceMock).toHaveBeenCalledWith("user-1", expect.objectContaining({
      projectId: "project-1",
      url: "https://example.com/docs",
      sourceType: "website",
    }))
    expect(response.status).toBe(201)
  })
})
