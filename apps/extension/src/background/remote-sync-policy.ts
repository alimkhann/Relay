import type { RelayRemoteStatus } from "../messaging/contracts"

export const SESSION_CACHE_TTL_MS = 30 * 60 * 1_000
export const DASHBOARD_CACHE_TTL_MS = 30 * 60 * 1_000
export const TAB_REMOTE_SYNC_FRESH_MS = 30 * 60 * 1_000

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
