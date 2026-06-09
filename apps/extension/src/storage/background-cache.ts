/**
 * Durable backing store for the background service worker's in-memory session
 * and dashboard caches. MV3 suspends the worker (~30s idle) and wipes module
 * memory, so every wake otherwise does a cold network round-trip before the
 * popup can render. Persisting to chrome.storage.local lets the first call
 * after a wake serve a recent value immediately, then revalidate.
 *
 * Security: every entry is namespaced by userId. A different account reads a
 * different key, so cached project data never crosses accounts (same isolation
 * rule the web persisted-query cache documents).
 */

import type { RelayProjectOption } from "../messaging/contracts"
import type {
  RelayOnboardingState,
  UserEntitlementsDto,
} from "@relay/shared"

const storage =
  typeof chrome !== "undefined" && chrome.storage?.local
    ? chrome.storage.local
    : null

const SESSION_KEY_PREFIX = "relay.bgcache.session."
const DASHBOARD_KEY_PREFIX = "relay.bgcache.dashboard."

// Beyond the in-memory TTLs (15s/20s) a persisted value may still be served
// once, immediately, while a fresh fetch runs in the background.
export const PERSIST_MAX_AGE_MS = 10 * 60_000

export interface PersistedSessionData {
  connected: boolean
  projects: RelayProjectOption[]
  settings: unknown
  onboarding: RelayOnboardingState
  entitlements: UserEntitlementsDto | null
}

interface Stamped<T> {
  data: T
  fetchedAt: number
}

let writeQueue: Promise<void> = Promise.resolve()

function enqueueWrite(task: () => Promise<void>): Promise<void> {
  const op = writeQueue.catch(() => undefined).then(task).catch(() => undefined)
  writeQueue = op
  return op
}

export async function readPersistedSessionData(
  userId: string,
): Promise<Stamped<PersistedSessionData> | null> {
  if (!storage || !userId) return null
  try {
    const key = SESSION_KEY_PREFIX + userId
    const result = await storage.get(key)
    const value = result[key] as Stamped<PersistedSessionData> | undefined
    if (!value || Date.now() - value.fetchedAt > PERSIST_MAX_AGE_MS) return null
    return value
  } catch {
    return null
  }
}

export function persistSessionData(
  userId: string,
  data: PersistedSessionData,
  fetchedAt: number,
): Promise<void> {
  if (!storage || !userId) return Promise.resolve()
  return enqueueWrite(async () => {
    await storage.set({
      [SESSION_KEY_PREFIX + userId]: { data, fetchedAt } as Stamped<PersistedSessionData>,
    })
  })
}

export async function readPersistedDashboard<T = unknown>(
  userId: string,
  projectId: string,
): Promise<Stamped<T> | null> {
  if (!storage || !userId || !projectId) return null
  try {
    const key = `${DASHBOARD_KEY_PREFIX}${userId}.${projectId}`
    const result = await storage.get(key)
    const value = result[key] as Stamped<T> | undefined
    if (!value || Date.now() - value.fetchedAt > PERSIST_MAX_AGE_MS) return null
    return value
  } catch {
    return null
  }
}

export function persistDashboard<T = unknown>(
  userId: string,
  projectId: string,
  data: T,
  fetchedAt: number,
): Promise<void> {
  if (!storage || !userId || !projectId) return Promise.resolve()
  return enqueueWrite(async () => {
    await storage.set({
      [`${DASHBOARD_KEY_PREFIX}${userId}.${projectId}`]: {
        data,
        fetchedAt,
      } as Stamped<T>,
    })
  })
}

export async function clearPersistedDashboard(
  userId: string,
  projectId: string,
): Promise<void> {
  if (!storage || !userId || !projectId) return
  try {
    await storage.remove(`${DASHBOARD_KEY_PREFIX}${userId}.${projectId}`)
  } catch {
    // Non-fatal; fetchProjectDashboard will revalidate from the network.
  }
}

/** Drop one user's persisted caches (sign-out), or every user's if omitted. */
export async function clearPersistedBackgroundCache(
  userId?: string,
): Promise<void> {
  if (!storage) return
  try {
    const all = await storage.get(null)
    const stale = Object.keys(all).filter((k) => {
      const isCache =
        k.startsWith(SESSION_KEY_PREFIX) || k.startsWith(DASHBOARD_KEY_PREFIX)
      if (!isCache) return false
      if (!userId) return true
      return (
        k === SESSION_KEY_PREFIX + userId ||
        k.startsWith(`${DASHBOARD_KEY_PREFIX}${userId}.`)
      )
    })
    if (stale.length > 0) await storage.remove(stale)
  } catch {
    // Non-fatal: a stale entry expires via PERSIST_MAX_AGE_MS anyway.
  }
}
