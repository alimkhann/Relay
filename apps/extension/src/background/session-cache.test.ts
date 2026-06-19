import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getRelaySessionMock,
  setRelaySessionMock,
  clearRelaySessionMock,
  relayFetchMock,
  readPersistedDashboardMock,
  clearPersistedDashboardMock,
} = vi.hoisted(() => ({
  getRelaySessionMock: vi.fn(),
  setRelaySessionMock: vi.fn(),
  clearRelaySessionMock: vi.fn(),
  relayFetchMock: vi.fn(),
  readPersistedDashboardMock: vi.fn().mockResolvedValue(null),
  clearPersistedDashboardMock: vi.fn().mockResolvedValue(undefined),
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
  readPersistedDashboard: readPersistedDashboardMock,
  persistDashboard: vi.fn(),
  clearPersistedBackgroundCache: vi.fn(),
  clearPersistedDashboard: clearPersistedDashboardMock,
}))

vi.mock("../utils/api", () => ({
  relayFetch: relayFetchMock,
  readRateLimitError: vi.fn(),
}))

vi.mock("./telemetry", () => ({
  recordBackgroundTelemetry: vi.fn(),
  identifyExtensionUser: vi.fn(),
}))

import {
  fetchProjectDashboard,
  invalidateProjectCache,
  loadSessionData,
  patchProjectDashboardCache,
  resolveDashboardForSync,
} from "./session-cache"
import { dashboardCache, dashboardCacheBypass, sessionCache, sessionRefresh } from "./state"
import { recordBackgroundTelemetry } from "./telemetry"

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

describe("loadSessionData runaway-loop guards", () => {
  const refreshFailedCalls = () =>
    vi.mocked(recordBackgroundTelemetry).mock.calls.filter(
      ([event]) => event.event === "session.refresh_failed",
    ).length

  const connectedSession = {
    token: "tok",
    connected: true,
    projectOptions: [{ id: "p1", name: "Relay" }],
    onboarding: { status: "completed" },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    sessionCache.current = null
    sessionRefresh.inFlight = null
    sessionRefresh.cooldownUntil = 0
    sessionRefresh.failureStreak = 0
    sessionRefresh.lastFailureLogAt = 0
  })

  // A non-ok response throws past retryRemote without its retry/backoff loop, so
  // these stay fast while still exercising the failure path.
  const failingResponse = { ok: false, status: 500, text: async () => "boom" }

  it("backs off after a failure and skips the network on the next forced refresh", async () => {
    getRelaySessionMock.mockResolvedValue(connectedSession)
    sessionCache.current = { token: "tok", data: { connected: true } as never, fetchedAt: 0 }
    relayFetchMock.mockResolvedValue(failingResponse)

    await loadSessionData(true)
    expect(relayFetchMock).toHaveBeenCalledTimes(1)
    expect(sessionRefresh.cooldownUntil).toBeGreaterThan(Date.now())

    relayFetchMock.mockClear()
    const data = await loadSessionData(true)

    expect(relayFetchMock).not.toHaveBeenCalled()
    expect(data.connected).toBe(true)
  })

  it("coalesces concurrent forced refreshes onto a single network request", async () => {
    getRelaySessionMock.mockResolvedValue({ token: "tok", userId: "u1" })
    relayFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        userId: "u1",
        projects: [],
        settings: { settings: { autoCapture: true, defaultTargetProfileKey: "" } },
        onboarding: { status: "completed" },
      }),
    })

    await Promise.all([loadSessionData(true), loadSessionData(true), loadSessionData(true)])

    expect(relayFetchMock).toHaveBeenCalledTimes(1)
  })

  it("throttles the failure telemetry so a loop cannot flood PostHog", async () => {
    getRelaySessionMock.mockResolvedValue(connectedSession)
    sessionCache.current = { token: "tok", data: { connected: true } as never, fetchedAt: 0 }
    relayFetchMock.mockResolvedValue(failingResponse)

    await loadSessionData(true)
    expect(refreshFailedCalls()).toBe(1)

    // Simulate the cooldown elapsing but within the telemetry-throttle window.
    sessionRefresh.cooldownUntil = 0
    await loadSessionData(true)

    expect(relayFetchMock).toHaveBeenCalledTimes(2)
    expect(refreshFailedCalls()).toBe(1)
  })
})

describe("fetchProjectDashboard cache invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dashboardCache.clear()
    dashboardCacheBypass.clear()
    getRelaySessionMock.mockResolvedValue({ token: "tok", userId: "u1" })
  })

  it("bypasses persisted dashboard and fetches from the network after invalidation", async () => {
    readPersistedDashboardMock.mockResolvedValue({
      data: { memory: [{ id: "stale" }] },
      fetchedAt: Date.now(),
    })
    relayFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ dashboard: { memory: [] } }),
    })

    invalidateProjectCache("p1")
    const dashboard = await fetchProjectDashboard("p1")

    expect(dashboard).toEqual({ memory: [] })
    expect(relayFetchMock).toHaveBeenCalledWith("/api/projects/p1")
    expect(readPersistedDashboardMock).not.toHaveBeenCalled()
    expect(clearPersistedDashboardMock).toHaveBeenCalledWith("u1", "p1")
  })
})

describe("patchProjectDashboardCache", () => {
  beforeEach(() => {
    dashboardCache.clear()
  })

  it("bootstraps an empty dashboard when cache is cold", () => {
    const next = patchProjectDashboardCache(
      "p1",
      {
        tool: "add_memory",
        action: "created",
        entity: "memory item",
        count: 1,
        items: [{ id: "m1", label: "New", content: "New", type: "note" }],
        previews: [{ after: { id: "m1", label: "New", content: "New", type: "note" } }],
      },
      "p1",
    )

    expect(next?.memory[0]?.id).toBe("m1")
    expect(dashboardCache.get("p1")?.dashboard?.memory[0]?.id).toBe("m1")
  })
})

describe("resolveDashboardForSync", () => {
  beforeEach(() => {
    dashboardCache.clear()
  })

  it("falls back to a patched cache when the network fetch returns null", () => {
    const syncStartedAt = Date.now()
    dashboardCache.set("p1", {
      dashboard: { project: { id: "p1" }, memory: [{ id: "m1" }] } as never,
      fetchedAt: syncStartedAt + 1,
    })

    expect(resolveDashboardForSync("p1", null, syncStartedAt)?.memory[0]?.id).toBe("m1")
  })

  it("keeps cached deletes when the network payload is stale", () => {
    const syncStartedAt = Date.now()
    dashboardCache.set("p1", {
      dashboard: { project: { id: "p1" }, memory: [{ id: "m1" }] } as never,
      fetchedAt: syncStartedAt + 1,
    })

    const resolved = resolveDashboardForSync(
      "p1",
      { project: { id: "p1" }, memory: [{ id: "m1" }, { id: "m2" }] } as never,
      syncStartedAt,
    )

    expect(resolved?.memory.map((item) => item.id)).toEqual(["m1"])
  })

  it("accepts new server rows from capture when cache was not patched during sync", () => {
    dashboardCache.set("p1", {
      dashboard: { project: { id: "p1" }, memory: [{ id: "m1" }] } as never,
      fetchedAt: Date.now() - 60_000,
    })

    const resolved = resolveDashboardForSync(
      "p1",
      { project: { id: "p1" }, memory: [{ id: "m1" }, { id: "m2" }] } as never,
      Date.now(),
    )

    expect(resolved?.memory.map((item) => item.id)).toEqual(["m1", "m2"])
  })

  it("unions cached creates missing from a stale network payload", () => {
    dashboardCache.set("p1", {
      dashboard: {
        project: { id: "p1" },
        memory: [{ id: "m-new", content: "fresh" }],
      } as never,
      fetchedAt: Date.now(),
    })

    const resolved = resolveDashboardForSync(
      "p1",
      { project: { id: "p1" }, memory: [{ id: "m-old", content: "old" }] } as never,
      Date.now() - 1_000,
    )

    expect(resolved?.memory.map((item) => item.id)).toEqual(["m-new", "m-old"])
  })
})
