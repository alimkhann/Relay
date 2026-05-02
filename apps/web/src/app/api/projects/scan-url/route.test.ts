import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  withApiAuthMock,
  resolveViewerMock,
  rejectMcpViewerMock,
  consumeIpRateLimitMock,
  scanProjectUrlMock,
} = vi.hoisted(() => ({
  withApiAuthMock: vi.fn((handler: (request: Request) => Promise<Response>) => handler),
  resolveViewerMock: vi.fn(),
  rejectMcpViewerMock: vi.fn(),
  consumeIpRateLimitMock: vi.fn(),
  scanProjectUrlMock: vi.fn(),
}))

vi.mock("@/server/http/api-route", () => ({
  withApiAuth: withApiAuthMock,
}))

vi.mock("@/server/policies/viewer", () => ({
  resolveViewer: resolveViewerMock,
  rejectMcpViewer: rejectMcpViewerMock,
}))

vi.mock("@/server/services/entitlement-service", () => ({
  consumeIpRateLimit: consumeIpRateLimitMock,
}))

vi.mock("@/server/services/project-scan-service", () => ({
  scanProjectUrl: scanProjectUrlMock,
}))

import { POST } from "./route"

describe("POST /api/projects/scan-url", () => {
  beforeEach(() => {
    resolveViewerMock.mockReset()
    rejectMcpViewerMock.mockReset()
    consumeIpRateLimitMock.mockReset()
    scanProjectUrlMock.mockReset()
  })

  it("requires a non-MCP viewer, consumes per-user rate limit, and returns scan output", async () => {
    resolveViewerMock.mockResolvedValue({ userId: "user-1", mode: "web" })
    scanProjectUrlMock.mockResolvedValue({
      name: "Relay",
      description: "AI context sync.",
      url: "https://www.onrelay.app/",
    })

    const response = await POST(new Request("https://relay.test/api/projects/scan-url", {
      method: "POST",
      body: JSON.stringify({ url: "https://www.onrelay.app" }),
    }))

    await expect(response.json()).resolves.toEqual({
      name: "Relay",
      description: "AI context sync.",
      url: "https://www.onrelay.app/",
    })
    expect(resolveViewerMock).toHaveBeenCalled()
    expect(rejectMcpViewerMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
      "Scoped MCP tokens cannot scan project URLs.",
    )
    expect(consumeIpRateLimitMock).toHaveBeenCalledWith("user:user-1", "project_scan_url_minute", 10)
    expect(scanProjectUrlMock).toHaveBeenCalledWith("https://www.onrelay.app")
  })
})
