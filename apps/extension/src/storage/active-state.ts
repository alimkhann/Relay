/**
 * Persist the last applied RelayActiveProjectState to chrome.storage.local so
 * the popup/sidepanel can paint the last known project + context instantly on
 * open instead of the blank "Relay stays quiet…" state, then refresh in place.
 *
 * Uses chrome.storage.local (not session) because the instant-paint win must
 * survive a full browser restart, not just MV3 worker suspension.
 *
 * Security: the snapshot is namespaced by userId (one key per user). Switching
 * accounts reads a different key, so account A never sees account B's cached
 * context. Mirrors the per-user isolation the web persisted-query cache uses.
 */

import type { RelayActiveProjectState } from "../messaging/contracts"

const storage =
  typeof chrome !== "undefined" && chrome.storage?.local
    ? chrome.storage.local
    : null

const KEY_PREFIX = "relay.activeState."

function keyFor(userId: string) {
  return `${KEY_PREFIX}${userId}`
}

let writeQueue: Promise<void> = Promise.resolve()

/**
 * The snapshot is first-paint scaffolding only. Keep the project-level context
 * (project, preview, trust, plan) which is valid regardless of which chat the
 * popup re-opens against, and neutralize everything that is per-chat/per-tab
 * or in-flight. Without this, opening the popup on chat B would briefly paint
 * chat A's association, freshness, insertability and page metadata until the
 * network refresh corrects it (~100-500ms). The live refresh fills the
 * neutralized fields back in immediately.
 */
function sanitizeForSnapshot(
  state: RelayActiveProjectState,
): RelayActiveProjectState {
  return {
    ...state,
    remoteStatus: "stale",
    // Per-chat / per-tab — not valid across a different chat.
    page: { supported: state.page.supported },
    chatAssociation: {
      status: "none",
      projectId: null,
      projectName: null,
      sessionId: null,
      reason: null,
      capturedAt: null,
    },
    routingReview: null,
    associationTier: "none",
    canInsert: false,
    capturePending: false,
    freshnessText: null,
    issue: null,
    lastReconciliation: null,
    // In-flight UI — must not replay stale.
    insertState: {
      status: "idle",
      source: null,
      message: null,
      updatedAt: null,
    },
    associationToast: {
      visible: false,
      mode: null,
      projectId: null,
      projectName: null,
      projectOptions: state.associationToast?.projectOptions ?? [],
      sessionId: null,
      expiresAt: null,
    },
  }
}

export async function getPersistedActiveState(
  userId: string,
): Promise<RelayActiveProjectState | null> {
  if (!storage || !userId) return null
  try {
    const result = await storage.get(keyFor(userId))
    const value = result[keyFor(userId)]
    return value ? (value as RelayActiveProjectState) : null
  } catch {
    return null
  }
}

export function persistActiveState(
  userId: string,
  state: RelayActiveProjectState,
): Promise<void> {
  if (!storage || !userId) return Promise.resolve()

  const operation = writeQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        await storage.set({ [keyFor(userId)]: sanitizeForSnapshot(state) })
      } catch {
        // Best-effort cache; a failed write just means a blank first paint.
      }
    })

  writeQueue = operation
  return operation
}

/**
 * Clear the snapshot. Pass a userId to clear one account, or omit to wipe
 * every persisted snapshot (used on sign-out).
 */
export async function clearPersistedActiveState(
  userId?: string,
): Promise<void> {
  if (!storage) return
  try {
    if (userId) {
      await storage.remove(keyFor(userId))
      return
    }
    const all = await storage.get(null)
    const stale = Object.keys(all).filter((k) => k.startsWith(KEY_PREFIX))
    if (stale.length > 0) await storage.remove(stale)
  } catch {
    // Non-fatal: a stale snapshot is corrected by the next refresh anyway.
  }
}
