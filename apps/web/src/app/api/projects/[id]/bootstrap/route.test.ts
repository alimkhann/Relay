import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  withApiAuthMock,
  resolveViewerMock,
  requireViewerProjectMock,
  consumeMcpReadQuotaMock,
  generateBootstrapForProjectMock,
  recordSyncMarkForUserMock,
  clearProjectBriefsMock,
} = vi.hoisted(() => ({
  withApiAuthMock: vi.fn((handler: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>) => handler),
  resolveViewerMock: vi.fn(),
  requireViewerProjectMock: vi.fn(),
  consumeMcpReadQuotaMock: vi.fn(),
  generateBootstrapForProjectMock: vi.fn(),
  recordSyncMarkForUserMock: vi.fn(),
  clearProjectBriefsMock: vi.fn(),
}))

vi.mock("@/server/http/api-route", () => ({ withApiAuth: withApiAuthMock }))
vi.mock("@/server/policies/viewer", () => ({ resolveViewer: resolveViewerMock, requireViewerProject: requireViewerProjectMock }))
vi.mock("@/server/services/entitlement-service", () => ({ consumeMcpReadQuota: consumeMcpReadQuotaMock }))
vi.mock("@/server/services/bootstrap-service", () => ({ generateBootstrapForProject: generateBootstrapForProjectMock }))
vi.mock("@/server/services/sync-mark-service", () => ({ recordSyncMarkForUser: recordSyncMarkForUserMock }))
vi.mock("@/server/services/project-governance-service", () => ({ clearProjectBriefs: clearProjectBriefsMock }))

import { POST } from "./route"

describe("POST /api/projects/[id]/bootstrap", () => {
  beforeEach(() => {
    resolveViewerMock.mockReset()
    requireViewerProjectMock.mockReset()
    consumeMcpReadQuotaMock.mockReset()
    generateBootstrapForProjectMock.mockReset()
    recordSyncMarkForUserMock.mockReset()
  })

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
