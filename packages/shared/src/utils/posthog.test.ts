import { describe, expect, it } from "vitest"

import { buildPosthogEvent, buildPosthogExceptionProperties, shouldCapturePosthogException } from "./posthog"

describe("buildPosthogEvent", () => {
  it("falls back to a projectId in context and keeps safe scalar properties", () => {
    const payload = buildPosthogEvent({
      level: "info",
      surface: "web-dashboard",
      area: "projects",
      event: "project_state.rebuilt",
      message: "Rebuilt project state.",
      context: {
        projectId: "project-123",
        durationMs: 45,
        nested: {
          ignored: true,
        },
      },
    })

    expect(payload.event).toBe("project_state_rebuilt")
    expect(payload.properties).toMatchObject({
      project_id: "project-123",
      duration_ms: 45,
    })
    expect(payload.properties).not.toHaveProperty("nested")
  })
})

describe("shouldCapturePosthogException", () => {
  it("captures runtime and explicit exception events", () => {
    expect(
      shouldCapturePosthogException({
        level: "error",
        surface: "extension-background",
        area: "runtime",
        event: "background.error",
        message: "Unhandled background error.",
        error: new Error("boom"),
      })
    ).toBe(true)

    expect(
      shouldCapturePosthogException({
        level: "error",
        surface: "web-auth",
        area: "auth",
        event: "google_sign_in.failed",
        message: "Handled failure.",
        error: new Error("nope"),
      })
    ).toBe(false)
  })

  it("includes the normalized event name in exception properties", () => {
    const properties = buildPosthogExceptionProperties({
      level: "error",
      surface: "web-dashboard",
      area: "page",
      event: "app.error_boundary_triggered",
      message: "App error boundary triggered.",
      error: new Error("boom"),
    })

    expect(properties.event_name).toBe("app_error_boundary_triggered")
    expect(properties.error_name).toBe("Error")
  })
})
