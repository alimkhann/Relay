import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  withApiAuthMock,
  resolveViewerMock,
  requireViewerProjectMock,
  consumeMcpReadQuotaMock,
  consumeMcpWriteQuotaMock,
  generateBootstrapForProjectMock,
  recordSyncMarkForUserMock,
  clearProjectBriefsMock,
  deleteProjectBriefMock,
  editProjectBriefMock,
} = vi.hoisted(() => ({
  withApiAuthMock: vi.fn((handler: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>) => handler),
  resolveViewerMock: vi.fn(),
  requireViewerProjectMock: vi.fn(),
  consumeMcpReadQuotaMock: vi.fn(),
  consumeMcpWriteQuotaMock: vi.fn(),
  generateBootstrapForProjectMock: vi.fn(),
  recordSyncMarkForUserMock: vi.fn(),
  clearProjectBriefsMock: vi.fn(),
  deleteProjectBriefMock: vi.fn(),
  editProjectBriefMock: vi.fn(),
}))

vi.mock("@/server/http/api-route", () => ({ withApiAuth: withApiAuthMock }))
vi.mock("@/server/policies/viewer", () => ({ resolveViewer: resolveViewerMock, requireViewerProject: requireViewerProjectMock }))
vi.mock("@/server/services/entitlement-service", () => ({ consumeMcpReadQuota: consumeMcpReadQuotaMock, consumeMcpWriteQuota: consumeMcpWriteQuotaMock }))
vi.mock("@/server/services/bootstrap-service", () => ({ generateBootstrapForProject: generateBootstrapForProjectMock }))
vi.mock("@/server/services/sync-mark-service", () => ({ recordSyncMarkForUser: recordSyncMarkForUserMock }))
vi.mock("@/server/services/project-governance-service", () => ({
  clearProjectBriefs: clearProjectBriefsMock,
  deleteProjectBrief: deleteProjectBriefMock,
  editProjectBrief: editProjectBriefMock,
}))

import { DELETE, PATCH, POST } from "./route"

beforeEach(() => {
  resolveViewerMock.mockReset()
  requireViewerProjectMock.mockReset()
  consumeMcpReadQuotaMock.mockReset()
  consumeMcpWriteQuotaMock.mockReset()
  generateBootstrapForProjectMock.mockReset()
  recordSyncMarkForUserMock.mockReset()
  clearProjectBriefsMock.mockReset()
  deleteProjectBriefMock.mockReset()
  editProjectBriefMock.mockReset()
})

describe("POST /api/projects/[id]/bootstrap", () => {

  it("charges a deep MCP read for agent full bootstrap", async () => {
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "mcp", projectId: "proj-1", scopes: ["brief:read"] })
    generateBootstrapForProjectMock.mockResolvedValue({ status: "ready", packet: { id: "pkt-1" }, reason: null, resolvedTargetProfileKey: "claude_code_build", stateStatus: {} })

    await POST(
      new Request("http://relay.test/api/projects/proj-1/bootstrap", {
        method: "POST",
        body: JSON.stringify({ targetProfileKey: "claude_code_build", kind: "fresh_chat_bootstrap", packetMode: "agent_full_bootstrap" }),
      }),
      { params: Promise.resolve({ id: "proj-1" }) },
    )

    expect(consumeMcpReadQuotaMock).toHaveBeenCalledWith("user-1", "deep")
  })

  it("charges a basic MCP read for quick continuity packets", async () => {
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "mcp", projectId: "proj-1", scopes: ["brief:read"] })
    generateBootstrapForProjectMock.mockResolvedValue({ status: "ready", packet: { id: "pkt-1" }, reason: null, resolvedTargetProfileKey: "chatgpt_planning", stateStatus: {} })

    await POST(
      new Request("http://relay.test/api/projects/proj-1/bootstrap", {
        method: "POST",
        body: JSON.stringify({ targetProfileKey: "chatgpt_planning", kind: "quick_continuity" }),
      }),
      { params: Promise.resolve({ id: "proj-1" }) },
    )

    expect(consumeMcpReadQuotaMock).toHaveBeenCalledWith("user-1", "basic")
  })
})

describe("DELETE /api/projects/[id]/bootstrap", () => {
  it("clears all briefs when no packetId is provided", async () => {
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "session" })

    await DELETE(
      new Request("http://relay.test/api/projects/proj-1/bootstrap", { method: "DELETE" }),
      { params: Promise.resolve({ id: "proj-1" }) },
    )

    expect(clearProjectBriefsMock).toHaveBeenCalledWith("user-1", "proj-1")
    expect(deleteProjectBriefMock).not.toHaveBeenCalled()
  })

  it("deletes a specific brief when packetId is provided", async () => {
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "session" })
    const packetId = "f945aa27-4282-4ca0-b631-f7a4075ea40f"

    await DELETE(
      new Request(`http://relay.test/api/projects/proj-1/bootstrap?packetId=${packetId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: "proj-1" }) },
    )

    expect(deleteProjectBriefMock).toHaveBeenCalledWith("user-1", "proj-1", packetId)
    expect(clearProjectBriefsMock).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/projects/[id]/bootstrap", () => {
  it("edits a brief by packet id", async () => {
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "session" })
    editProjectBriefMock.mockResolvedValue({ id: "pkt-1" })

    const response = await PATCH(
      new Request("http://relay.test/api/projects/proj-1/bootstrap", {
        method: "PATCH",
        body: JSON.stringify({
          packetId: "f945aa27-4282-4ca0-b631-f7a4075ea40f",
          content: "Updated brief content",
        }),
      }),
      { params: Promise.resolve({ id: "proj-1" }) },
    )

    expect(editProjectBriefMock).toHaveBeenCalledWith(
      "user-1",
      "proj-1",
      "f945aa27-4282-4ca0-b631-f7a4075ea40f",
      "Updated brief content",
    )
    expect(response.status).toBe(200)
  })
})
