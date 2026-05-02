import { beforeEach, describe, expect, it, vi } from "vitest"

import { logClientEvent } from "./client"

describe("logClientEvent", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState({}, "", "/sign-in")
  })

  it("logs a sanitized event to the console without sending network requests", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    logClientEvent({
      level: "info",
      area: "auth",
      event: "google_sign_in.started",
      message: "Started web sign-in.",
      context: {
        accessToken: "super-secret-token"
      }
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy.mock.calls[0]?.[0]).toContain("[Relay Web] web-auth google_sign_in.started")
    expect(infoSpy.mock.calls[0]?.[1]).toMatchObject({
      surface: "web-auth",
      url: "/sign-in",
      context: {
        accessToken: "[redacted]"
      }
    })
  })

  it("routes settings paths to the web-settings surface", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    window.history.replaceState({}, "", "/settings?section=billing")

    logClientEvent({
      level: "info",
      area: "billing",
      event: "settings_viewed",
      message: "Viewed settings.",
    })

    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy.mock.calls[0]?.[1]).toMatchObject({
      surface: "web-settings",
      url: "/settings",
    })
  })
})
