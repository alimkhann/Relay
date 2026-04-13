import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  withApiAuthMock,
  resolveViewerMock,
  requireViewerProjectMock,
  consumeMcpReadQuotaMock,
  consumeMcpWriteQuotaMock,
  listProjectCanonMock,
  createCanonEntryMock,
} = vi.hoisted(() => ({
  withApiAuthMock: vi.fn((handler: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>) => handler),
  resolveViewerMock: vi.fn(),
  requireViewerProjectMock: vi.fn(),
  consumeMcpReadQuotaMock: vi.fn(),
  consumeMcpWriteQuotaMock: vi.fn(),
  listProjectCanonMock: vi.fn(),
  createCanonEntryMock: vi.fn(),
}))

vi.mock("@/server/http/api-route", () => ({
  withApiAuth: withApiAuthMock,
}))

vi.mock("@/server/policies/viewer", () => ({
  resolveViewer: resolveViewerMock,
  requireViewerProject: requireViewerProjectMock,
}))

vi.mock("@/server/services/entitlement-service", () => ({
  consumeMcpReadQuota: consumeMcpReadQuotaMock,
  consumeMcpWriteQuota: consumeMcpWriteQuotaMock,
}))

vi.mock("@/server/services/project-canon-service", () => ({
  listProjectCanon: listProjectCanonMock,
  createCanonEntry: createCanonEntryMock,
}))

import { GET, POST } from "./route"

describe("/api/projects/[id]/canon", () => {
  beforeEach(() => {
    resolveViewerMock.mockReset()
    requireViewerProjectMock.mockReset()
    consumeMcpReadQuotaMock.mockReset()
    consumeMcpWriteQuotaMock.mockReset()
    listProjectCanonMock.mockReset()
    createCanonEntryMock.mockReset()
  })

  it("lists canon entries for an MCP viewer", async () => {
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "mcp", projectId: "proj-1", scopes: ["project:read"] })
    listProjectCanonMock.mockResolvedValue([{ id: "canon-1", kind: "decision" }])

    const response = await GET(new Request("http://relay.test/api/projects/proj-1/canon?includeEvidence=true&kind=decision"), {
      params: Promise.resolve({ id: "proj-1" }),
    })
    const payload = await response.json()

    expect(requireViewerProjectMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), "proj-1", "project:read")
    expect(consumeMcpReadQuotaMock).toHaveBeenCalledWith("user-1")
    expect(listProjectCanonMock).toHaveBeenCalledWith("user-1", "proj-1", {
      kinds: ["decision"],
      statuses: undefined,
      includeEvidence: true,
    })
    expect(payload).toEqual({ canon: [{ id: "canon-1", kind: "decision" }] })
  })

  it("creates a canon entry scoped to the project", async () => {
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "mcp", projectId: "proj-1", scopes: ["project:write"] })
    createCanonEntryMock.mockResolvedValue({ id: "canon-1", kind: "objective" })

    const response = await POST(
      new Request("http://relay.test/api/projects/proj-1/canon", {
        method: "POST",
        body: JSON.stringify({ kind: "objective", content: "Ship canon v1." }),
      }),
      { params: Promise.resolve({ id: "proj-1" }) },
    )

    expect(response.status).toBe(201)
    expect(requireViewerProjectMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }), "proj-1", "project:write")
    expect(consumeMcpWriteQuotaMock).toHaveBeenCalledWith("user-1")
    expect(createCanonEntryMock).toHaveBeenCalledWith("user-1", {
      kind: "objective",
      content: "Ship canon v1.",
      projectId: "proj-1",
    })
  })
})
