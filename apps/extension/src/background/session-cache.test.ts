import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getRelaySessionMock,
  setRelaySessionMock,
  clearRelaySessionMock,
  relayFetchMock,
} = vi.hoisted(() => ({
  getRelaySessionMock: vi.fn(),
  setRelaySessionMock: vi.fn(),
  clearRelaySessionMock: vi.fn(),
  relayFetchMock: vi.fn(),
}))

vi.mock("../storage/session", () => ({
  getRelaySession: getRelaySessionMock,
  setRelaySession: setRelaySessionMock,
  clearRelaySession: clearRelaySessionMock,
  resolveRelayApiBase: vi.fn(() => "https://relay.test"),
}))

vi.mock("../storage/background-cache", () => ({
  readPersistedSessionData: vi.fn().mockResolvedValue(null),
  persistSessionData: vi.fn(),
  readPersistedDashboard: vi.fn().mockResolvedValue(null),
  persistDashboard: vi.fn(),
  clearPersistedBackgroundCache: vi.fn(),
}))

vi.mock("../utils/api", () => ({
  relayFetch: relayFetchMock,
  readRateLimitError: vi.fn(),
}))

vi.mock("./telemetry", () => ({
  recordBackgroundTelemetry: vi.fn(),
  identifyExtensionUser: vi.fn(),
}))

import { loadSessionData } from "./session-cache"
import { sessionCache } from "./state"

describe("loadSessionData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionCache.current = null
  })

  it("returns a disconnected snapshot and clears the cache when there is no token", async () => {
    getRelaySessionMock.mockResolvedValue({ token: "" })
    sessionCache.current = { token: "old", data: {} as never, fetchedAt: Date.now() }

    const data = await loadSessionData()

    expect(data.connected).toBe(false)
    expect(data.projects).toEqual([])
    expect(sessionCache.current).toBeNull()
    expect(relayFetchMock).not.toHaveBeenCalled()
  })

  it("serves the in-memory cache without a network call when fresh (TTL not elapsed)", async () => {
    getRelaySessionMock.mockResolvedValue({ token: "tok" })
    const cachedData = {
      connected: true,
      projects: [{ id: "p1", name: "Relay" }],
      settings: null,
      onboarding: { status: "completed" },
      entitlements: null,
    }
    sessionCache.current = { token: "tok", data: cachedData as never, fetchedAt: Date.now() }

    const data = await loadSessionData()

    expect(data).toBe(cachedData)
    expect(relayFetchMock).not.toHaveBeenCalled()
  })

  it("forces a network refresh when force=true even if the cache is fresh", async () => {
    getRelaySessionMock.mockResolvedValue({ token: "tok", userId: "u1" })
    sessionCache.current = {
      token: "tok",
      data: { connected: true, projects: [], settings: null, onboarding: { status: "completed" }, entitlements: null } as never,
      fetchedAt: Date.now(),
    }
    relayFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        userId: "u1",
        projects: [],
        settings: { settings: { autoCapture: true, defaultTargetProfileKey: "" } },
        onboarding: { status: "completed" },
      }),
    })

    await loadSessionData(true)

    expect(relayFetchMock).toHaveBeenCalledWith("/api/extension/session")
  })
})
