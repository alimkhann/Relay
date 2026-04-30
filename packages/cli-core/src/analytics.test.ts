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

describe("RelayNodeAnalytics", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.RELAY_POSTHOG_KEY = "test_posthog_key"
    global.fetch = vi.fn()
  })

  it("links the anonymous node journey when identifying a viewer", async () => {
    const { RelayNodeAnalytics } = await import("./analytics")
    const analytics = new RelayNodeAnalytics({
      app: "cli",
      appSource: "relay-cli",
      anonymousPrefix: "relay-cli",
      appVersion: "1.2.3",
    })

    analytics.capture("wizard_started", { mode: "auto" })

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
        $anon_distinct_id: expect.stringMatching(/^relay-cli:/),
      }),
    })
    expect(posthogInstance.capture).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        distinctId: expect.stringMatching(/^relay-cli:/),
        event: "wizard_started",
      })
    )

    analytics.capture("wizard_auth_completed")

    expect(posthogInstance.capture).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        distinctId: "user-123",
        event: "wizard_auth_completed",
      })
    )
  })
})
