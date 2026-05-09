import { beforeEach, describe, expect, it, vi } from "vitest"

const { assertIpRateLimitMock, captureServerEventMock } = vi.hoisted(() => ({
  assertIpRateLimitMock: vi.fn(),
  captureServerEventMock: vi.fn(),
}))

vi.mock("@/server/services/rate-limit-service", () => ({
  assertIpRateLimit: assertIpRateLimitMock,
}))

vi.mock("@/lib/telemetry/posthog-server", () => ({
  captureServerEvent: captureServerEventMock,
}))

import { POST } from "./route"

describe("POST /api/feedback/uninstall", () => {
  beforeEach(() => {
    assertIpRateLimitMock.mockReset()
    captureServerEventMock.mockReset()
  })

  it("captures selected uninstall reasons and note in server telemetry", async () => {
    const response = await POST(
      new Request("https://relay.test/api/feedback/uninstall", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.10",
          referer: "https://onrelay.app/goodbye",
          "user-agent": "Chrome Test",
        },
        body: JSON.stringify({
          reasons: ["too_complex", "missing_feature"],
          note: "Setup did not make sense.",
        }),
      })
    )

    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(assertIpRateLimitMock).toHaveBeenCalledWith(expect.any(Request), "extension_uninstall_feedback_ip", 10)
    expect(captureServerEventMock).toHaveBeenCalledWith({
      event: "extension_uninstall_feedback_submitted",
      distinctId: expect.stringMatching(/^anon-/),
      properties: expect.objectContaining({
        source: "extension_uninstall",
        reasons: "too_complex,missing_feature",
        reason_count: 2,
        reason_too_complex: true,
        reason_missing_feature: true,
        reason_switching_tool: false,
        reason_just_trying: false,
        reason_price: false,
        reason_other: false,
        note: "Setup did not make sense.",
        note_length: 25,
        path: "/api/feedback/uninstall",
        referrer: "https://onrelay.app/goodbye",
        user_agent: "Chrome Test",
      }),
    })
  })

  it("rejects unknown reason ids", async () => {
    const response = await POST(
      new Request("https://relay.test/api/feedback/uninstall", {
        method: "POST",
        body: JSON.stringify({ reasons: ["unknown"], note: null }),
      })
    )

    expect(response.status).toBe(400)
    expect(captureServerEventMock).not.toHaveBeenCalled()
  })
})
