import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  withApiAuthMock,
  resolveViewerMock,
  requireViewerProjectMock,
  consumeMcpReadQuotaMock,
  consumeMcpWriteQuotaMock,
  getProjectSettingsMock,
  updateProjectSettingsMock,
} = vi.hoisted(() => ({
  withApiAuthMock: vi.fn((handler: any) => handler),
  resolveViewerMock: vi.fn(),
  requireViewerProjectMock: vi.fn(),
  consumeMcpReadQuotaMock: vi.fn(),
  consumeMcpWriteQuotaMock: vi.fn(),
  getProjectSettingsMock: vi.fn(),
  updateProjectSettingsMock: vi.fn(),
}))

vi.mock("@/server/http/api-route", () => ({ withApiAuth: withApiAuthMock }))
vi.mock("@/server/policies/viewer", () => ({ resolveViewer: resolveViewerMock, requireViewerProject: requireViewerProjectMock }))
vi.mock("@/server/services/entitlement-service", () => ({ consumeActionQuota: vi.fn(), consumeMcpReadQuota: consumeMcpReadQuotaMock, consumeMcpWriteQuota: consumeMcpWriteQuotaMock }))
vi.mock("@/server/services/project-settings-service", () => ({ getProjectSettings: getProjectSettingsMock, updateProjectSettings: updateProjectSettingsMock }))

import { GET, PATCH } from "./route"

describe("/api/projects/[id]/settings", () => {
  beforeEach(() => {
    resolveViewerMock.mockReset()
    requireViewerProjectMock.mockReset()
    consumeMcpReadQuotaMock.mockReset()
    consumeMcpWriteQuotaMock.mockReset()
    getProjectSettingsMock.mockReset()
    updateProjectSettingsMock.mockReset()
  })

  it("returns project settings", async () => {
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "mcp", scopes: ["project:read"] })
    getProjectSettingsMock.mockResolvedValue({ autonomyMode: "standard" })
    const response = await GET(new Request("http://relay.test/api/projects/proj-1/settings"), { params: Promise.resolve({ id: "proj-1" }) })
    expect(consumeMcpReadQuotaMock).toHaveBeenCalledWith("user-1")
    expect(requireViewerProjectMock).toHaveBeenCalled()
    expect(await response.json()).toEqual({ settings: { autonomyMode: "standard" } })
  })

  it("updates project settings", async () => {
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "mcp", scopes: ["project:write"] })
    updateProjectSettingsMock.mockResolvedValue({ autonomyMode: "conservative" })
    const response = await PATCH(new Request("http://relay.test/api/projects/proj-1/settings", { method: "PATCH", body: JSON.stringify({ autonomyMode: "conservative" }) }), { params: Promise.resolve({ id: "proj-1" }) })
    expect(consumeMcpWriteQuotaMock).toHaveBeenCalledWith("user-1")
    expect(await response.json()).toEqual({ settings: { autonomyMode: "conservative" } })
  })
})
