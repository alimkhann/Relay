import type { RelayRemoteStatus } from "../messaging/contracts"

export const SESSION_CACHE_TTL_MS = 10 * 60 * 1_000
export const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1_000
export const TAB_REMOTE_SYNC_FRESH_MS = 5 * 60 * 1_000

// After a failed session refresh, skip the network for this long (indexed by
// consecutive-failure count, capped at the last entry) so a persistently-failing
// API cannot be hammered. Overrides force:true.
export const SESSION_REFRESH_FAILURE_BACKOFF_MS = [
  5_000, 15_000, 30_000, 60_000, 120_000, 300_000, 900_000,
]

// Emit at most one `session.refresh_failed` telemetry event per this window, so
// a failure loop cannot flood PostHog even if a new trigger path appears.
export const SESSION_REFRESH_FAILURE_LOG_THROTTLE_MS = 15 * 60_000

export function shouldSyncMissingRemoteState(input: {
  pageSupported: boolean
  remoteStatus: RelayRemoteStatus
  lastSuccessfulSyncAt: string | null
}) {
  return (
    input.pageSupported &&
    (input.remoteStatus === "unavailable" || !input.lastSuccessfulSyncAt)
  )
}

export function shouldSyncProjectDashboardOnly(input: {
  pageSupported: boolean
  connected: boolean
  hasProjectId: boolean
  remoteStatus: RelayRemoteStatus
  lastSuccessfulSyncAt: string | null
  projectId?: string | null
  lastSyncedProjectId?: string | null
}) {
  const projectChanged = Boolean(
    input.projectId &&
      input.lastSyncedProjectId &&
      input.projectId !== input.lastSyncedProjectId,
  )

  return (
    !input.pageSupported &&
    input.connected &&
    input.hasProjectId &&
    (input.remoteStatus === "unavailable" ||
      (!input.lastSuccessfulSyncAt && input.remoteStatus !== "loading") ||
      projectChanged)
  )
}
