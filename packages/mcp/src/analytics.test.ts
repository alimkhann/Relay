import { beforeEach, describe, expect, it, vi } from "vitest"

const posthogInstance = {
  register: vi.fn(),
  identify: vi.fn(),
  capture: vi.fn(),
  shutdown: vi.fn(),
}

vi.mock("posthog-node", () => ({
  PostHog: vi.fn(() => posthogInstance),
}))

describe("RelayMcpAnalytics", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.RELAY_POSTHOG_KEY = "test_posthog_key"
    global.fetch = vi.fn()
  })

  it("links anonymous MCP startup events to the identified viewer", async () => {
    const { RelayMcpAnalytics } = await import("./analytics")
    const analytics = new RelayMcpAnalytics()

    analytics.capture("mcp_server_started", { transport: "stdio" })

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          userId: "user-123",
          email: "user@example.com",
          name: "Test User",
        })
      )
    )

    await analytics.identify("https://relay.example", "token-123")

    expect(posthogInstance.identify).toHaveBeenCalledWith({
      distinctId: "user-123",
      properties: expect.objectContaining({
        email: "user@example.com",
        name: "Test User",
        $anon_distinct_id: expect.stringMatching(/^relay-mcp:/),
      }),
    })

    analytics.capture("mcp_tool_called", { tool_name: "get_brief" })

    expect(posthogInstance.capture).toHaveBeenLastCalledWith(
      expect.objectContaining({
        distinctId: "user-123",
        event: "mcp_tool_called",
      })
    )
  })
})
