import { describe, expect, it } from "vitest"

import {
  DASHBOARD_CACHE_TTL_MS,
  SESSION_CACHE_TTL_MS,
  shouldSyncMissingRemoteState,
  shouldSyncProjectDashboardOnly,
  TAB_REMOTE_SYNC_FRESH_MS,
} from "./remote-sync-policy"

describe("background remote sync policy", () => {
  it("does not sync unsupported tabs", () => {
    expect(
      shouldSyncMissingRemoteState({
        pageSupported: false,
        remoteStatus: "unavailable",
        lastSuccessfulSyncAt: null,
      }),
    ).toBe(false)
  })

  it("does not sync supported tabs that already have a successful remote state", () => {
    expect(
      shouldSyncMissingRemoteState({
        pageSupported: true,
        remoteStatus: "ready",
        lastSuccessfulSyncAt: "2026-06-07T00:00:00.000Z",
      }),
    ).toBe(false)

    expect(
      shouldSyncMissingRemoteState({
        pageSupported: true,
        remoteStatus: "stale",
        lastSuccessfulSyncAt: "2026-06-07T00:00:00.000Z",
      }),
    ).toBe(false)
  })

  it("syncs a supported tab only when its initial remote state is missing", () => {
    expect(
      shouldSyncMissingRemoteState({
        pageSupported: true,
        remoteStatus: "unavailable",
        lastSuccessfulSyncAt: null,
      }),
    ).toBe(true)
  })

  it("syncs unsupported tabs when a selected project exists but dashboard state is missing", () => {
    expect(
      shouldSyncProjectDashboardOnly({
        pageSupported: false,
        connected: true,
        hasProjectId: true,
        remoteStatus: "unavailable",
        lastSuccessfulSyncAt: null,
      }),
    ).toBe(true)

    expect(
      shouldSyncProjectDashboardOnly({
        pageSupported: false,
        connected: true,
        hasProjectId: false,
        remoteStatus: "unavailable",
        lastSuccessfulSyncAt: null,
      }),
    ).toBe(false)
  })

  it("keeps session and dashboard data fresh for thirty minutes", () => {
    expect(SESSION_CACHE_TTL_MS).toBe(30 * 60 * 1_000)
    expect(DASHBOARD_CACHE_TTL_MS).toBe(30 * 60 * 1_000)
    expect(TAB_REMOTE_SYNC_FRESH_MS).toBe(30 * 60 * 1_000)
  })
})
