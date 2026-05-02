import { describe, expect, it } from "vitest"

import { sanitizeTelemetryEvent } from "./telemetry"

describe("sanitizeTelemetryEvent", () => {
  it("redacts secret-bearing keys and truncates long values", () => {
    const event = sanitizeTelemetryEvent({
      level: "error",
      surface: "web-api",
      area: "auth",
      event: "auth.failed",
      message: "x".repeat(500),
      context: {
        accessToken: "secret-token",
        nested: {
          authorization: "Bearer value",
          okay: "visible"
        }
      },
      error: new Error("boom")
    })

    expect(event.message.length).toBeLessThanOrEqual(401)
    expect(event.context?.accessToken).toBe("[redacted]")
    expect((event.context?.nested as Record<string, unknown>).authorization).toBe("[redacted]")
    expect((event.context?.nested as Record<string, unknown>).okay).toBe("visible")
    expect((event.error as { message?: string } | null)?.message).toBe("boom")
  })
})
