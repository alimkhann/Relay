import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  withApiAuthMock,
  resolveViewerMock,
  requireViewerProjectMock,
  consumeMcpReadQuotaMock,
  listProjectSourcesMock,
  createSourceFromUploadMock,
} = vi.hoisted(() => ({
  withApiAuthMock: vi.fn((handler: any) => handler),
  resolveViewerMock: vi.fn(),
  requireViewerProjectMock: vi.fn(),
  consumeMcpReadQuotaMock: vi.fn(),
  listProjectSourcesMock: vi.fn(),
  createSourceFromUploadMock: vi.fn(),
}))

vi.mock("@/server/http/api-route", () => ({ withApiAuth: withApiAuthMock }))
vi.mock("@/server/policies/viewer", () => ({ resolveViewer: resolveViewerMock, requireViewerProject: requireViewerProjectMock }))
vi.mock("@/server/services/entitlement-service", () => ({ consumeMcpReadQuota: consumeMcpReadQuotaMock }))
vi.mock("@/server/services/source-service", () => ({
  listProjectSources: listProjectSourcesMock,
  createSourceFromUpload: createSourceFromUploadMock,
}))

import { GET, POST } from "./route"

describe("/api/projects/[id]/sources", () => {
  beforeEach(() => {
    resolveViewerMock.mockReset()
    requireViewerProjectMock.mockReset()
    consumeMcpReadQuotaMock.mockReset()
    listProjectSourcesMock.mockReset()
    createSourceFromUploadMock.mockReset()
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "web" })
  })

  it("lists project sources", async () => {
    listProjectSourcesMock.mockResolvedValue([{ id: "source-1", displayName: "Spec.md" }])

    const response = await GET(new Request("http://relay.test/api/projects/project-1/sources"), {
      params: Promise.resolve({ id: "project-1" }),
    })

    expect(requireViewerProjectMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), "project-1", "memory:read")
    expect(await response.json()).toEqual({ sources: [{ id: "source-1", displayName: "Spec.md" }] })
  })

  it("accepts multipart source uploads", async () => {
    createSourceFromUploadMock.mockResolvedValue({ source: { id: "source-1" } })
    const formData = {
      get: (key: string) => key === "file"
        ? {
            name: "source.md",
            type: "text/markdown",
            arrayBuffer: async () => Buffer.from("# Source").buffer,
          }
        : null,
    }

    const request = new Request("http://relay.test/api/projects/project-1/sources", { method: "POST" })
    Object.defineProperty(request, "formData", {
      value: async () => formData,
    })

    const response = await POST(request, {
      params: Promise.resolve({ id: "project-1" }),
    })

    expect(createSourceFromUploadMock).toHaveBeenCalledWith("user-1", expect.objectContaining({
      projectId: "project-1",
      fileName: "source.md",
      mimeType: "text/markdown",
    }))
    expect(response.status).toBe(201)
  })
})
