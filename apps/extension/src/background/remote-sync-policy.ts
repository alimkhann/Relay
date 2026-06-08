import type { RelayRemoteStatus } from "../messaging/contracts"

export const SESSION_CACHE_TTL_MS = 10 * 60 * 1_000
export const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1_000
export const TAB_REMOTE_SYNC_FRESH_MS = 5 * 60 * 1_000

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
      input.remoteStatus === "loading" ||
      !input.lastSuccessfulSyncAt ||
      projectChanged)
  )
}
