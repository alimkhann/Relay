import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  withApiAuthMock,
  resolveViewerMock,
  requireViewerProjectMock,
  consumeMcpReadQuotaMock,
  listCachedProjectSourcesMock,
  createSourceFromUploadMock,
  processUploadedSourceMock,
  runAfterResponseMock,
} = vi.hoisted(() => ({
  withApiAuthMock: vi.fn((handler: any) => handler),
  resolveViewerMock: vi.fn(),
  requireViewerProjectMock: vi.fn(),
  consumeMcpReadQuotaMock: vi.fn(),
  listCachedProjectSourcesMock: vi.fn(),
  createSourceFromUploadMock: vi.fn(),
  processUploadedSourceMock: vi.fn(),
  runAfterResponseMock: vi.fn((task: () => unknown) => { void task() }),
}))

vi.mock("@/server/http/api-route", () => ({ withApiAuth: withApiAuthMock }))
vi.mock("@/server/http/after", () => ({ runAfterResponse: runAfterResponseMock }))
vi.mock("@/server/policies/viewer", () => ({ resolveViewer: resolveViewerMock, requireViewerProject: requireViewerProjectMock }))
vi.mock("@/server/services/entitlement-service", () => ({ consumeActionQuota: vi.fn(), consumeMcpReadQuota: consumeMcpReadQuotaMock }))
vi.mock("@/server/cache/read-model-cache", () => ({
  listCachedProjectSources: listCachedProjectSourcesMock,
}))
vi.mock("@/server/services/source-service", () => ({
  createSourceFromUpload: createSourceFromUploadMock,
  processUploadedSource: processUploadedSourceMock,
}))

import { GET, POST } from "./route"

describe("/api/projects/[id]/sources", () => {
  beforeEach(() => {
    resolveViewerMock.mockReset()
    requireViewerProjectMock.mockReset()
    consumeMcpReadQuotaMock.mockReset()
    listCachedProjectSourcesMock.mockReset()
    createSourceFromUploadMock.mockReset()
    processUploadedSourceMock.mockReset()
    runAfterResponseMock.mockClear()
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "web" })
  })

  it("lists project sources", async () => {
    listCachedProjectSourcesMock.mockResolvedValue([{ id: "source-1", displayName: "Spec.md" }])

    const response = await GET(new Request("http://relay.test/api/projects/project-1/sources"), {
      params: Promise.resolve({ id: "project-1" }),
    })

    expect(requireViewerProjectMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), "project-1", "memory:read")
    expect(listCachedProjectSourcesMock).toHaveBeenCalledWith("user-1", "project-1")
    expect(await response.json()).toEqual({ sources: [{ id: "source-1", displayName: "Spec.md" }] })
  })

  it("accepts multipart uploads and processes in the background", async () => {
    createSourceFromUploadMock.mockResolvedValue({
      detail: { source: { id: "source-1", status: "processing" } },
      processing: { projectId: "project-1", sourceId: "source-1", versionId: "version-1" },
    })
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
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ source: { id: "source-1", status: "processing" } })
    expect(runAfterResponseMock).toHaveBeenCalledTimes(1)
    expect(processUploadedSourceMock).toHaveBeenCalledWith("user-1", expect.objectContaining({
      sourceId: "source-1",
      versionId: "version-1",
    }))
  })
})
