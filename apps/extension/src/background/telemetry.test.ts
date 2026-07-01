import { beforeEach, describe, expect, it, vi } from "vitest"

const { fetchMock, getRelaySessionMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getRelaySessionMock: vi.fn(),
}))

vi.mock("../storage/session", () => ({
  getRelaySession: getRelaySessionMock,
}))

vi.stubGlobal("fetch", fetchMock)
vi.stubGlobal("chrome", {
  runtime: {
    getManifest: () => ({ version: "0.0.0-test" }),
  },
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
    },
  },
})

describe("extension background telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PLASMO_PUBLIC_POSTHOG_KEY = "phc_test"
    process.env.PLASMO_PUBLIC_POSTHOG_HOST = "https://posthog.test"
    getRelaySessionMock.mockResolvedValue({ userId: "user-1" })
  })

  it("does not send debug events to PostHog", async () => {
    const { flushBackgroundTelemetry, recordBackgroundTelemetry } = await import("./telemetry")

    recordBackgroundTelemetry({
      level: "debug",
      surface: "extension-background",
      area: "session",
      event: "extension_session_refreshed",
      message: "Routine refresh.",
    })
    await flushBackgroundTelemetry()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
