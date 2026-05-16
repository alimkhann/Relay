import { clear as idbClear } from "idb-keyval"

/**
 * Scrub the persisted React Query cache from IndexedDB. Called on sign-out so
 * a shared browser never leaves one user's cached project data on disk for
 * the next session. The default idb-keyval store holds only the RQ cache.
 */
export async function clearRelayQueryCache() {
  try {
    await idbClear()
  } catch {
    // Best-effort; key namespacing by userId is the primary isolation.
  }
}
