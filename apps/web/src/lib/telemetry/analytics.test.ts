import { describe, expect, it } from "vitest"

import { buildRelayAnalyticsPayload } from "./analytics"

describe("buildRelayAnalyticsPayload", () => {
  it("maps legacy page events to page_viewed with page context", () => {
    const payload = buildRelayAnalyticsPayload(
      {
        level: "info",
        surface: "web-dashboard",
        area: "page",
        event: "dashboard_viewed",
        message: "Rendered the dashboard.",
        userId: "user-1",
        projectId: "project-1",
        context: {
          hasProject: true,
        },
      },
      {
        mode: "client",
        pathname: "/dashboard",
        fromPath: "/sign-in",
        referrer: "https://www.google.com/",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "relay-launch",
        userId: "user-1",
        sessionId: "session-1",
        plan: "starter",
        isAuthenticated: true,
      }
    )

    expect(payload.event).toBe("page_viewed")
    expect(payload.distinctId).toBe("user-1")
    expect(payload.properties).toMatchObject({
      user_id: "user-1",
      session_id: "session-1",
      platform: "web",
      pathname: "/dashboard",
      page_name: "dashboard",
      page_group: "workspace",
      from_path: "/sign-in",
      referrer: "https://www.google.com/",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "relay-launch",
      plan: "starter",
      is_authenticated: true,
      project_id: "project-1",
      has_project: true,
      raw_event_name: "dashboard_viewed",
    })
  })

  it("maps runtime failures to error_occurred with error properties", () => {
    const payload = buildRelayAnalyticsPayload(
      {
        level: "error",
        surface: "web-dashboard",
        area: "window",
        event: "window.error",
        message: "Unhandled browser error.",
        error: new TypeError("Boom"),
      },
      {
        mode: "client",
        pathname: "/settings",
      }
    )

    expect(payload.event).toBe("error_occurred")
    expect(payload.properties).toMatchObject({
      pathname: "/settings",
      page_name: "settings",
      page_group: "workspace",
      error_type: "TypeError",
      error_message: "Boom",
      error_source: "window_error",
      is_fatal: true,
    })
  })
})
