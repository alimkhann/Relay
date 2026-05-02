/**
 * Persist capture signatures to chrome.storage.session so they survive
 * MV3 service worker suspension (~30s idle timeout). Without this,
 * lastCapturedSignature resets to null on worker wake, causing
 * re-capture of already-captured content.
 *
 * Uses chrome.storage.session (not local) because:
 * - Survives worker restarts within same browser session
 * - Automatically cleared when browser closes (no stale state)
 * - 10 MB quota is sufficient for per-tab signature tracking
 */

const storage = typeof chrome !== "undefined" && chrome.storage?.session
  ? chrome.storage.session
  : null

const STORAGE_KEY = "relay.capture.tabSignatures"

export interface TabCaptureSignature {
  lastCapturedSignature: string | null
  lastCapturedTurns: number
  lastRoutedSignature: string | null
  updatedAt: number
}

type SignatureMap = Record<string, TabCaptureSignature>
let signatureWriteQueue: Promise<void> = Promise.resolve()

async function updateSignatureMap(mutator: (map: SignatureMap) => void): Promise<void> {
  if (!storage) return

  const operation = signatureWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const map = await getSignatureMap()
      mutator(map)
      await storage.set({ [STORAGE_KEY]: map })
    })

  signatureWriteQueue = operation
  await operation
}

/** Persist a tab's capture signature after successful capture. */
export async function persistTabSignature(
  tabId: number,
  data: TabCaptureSignature
): Promise<void> {
  await updateSignatureMap((map) => {
    map[String(tabId)] = data
  })
}

/** Retrieve a tab's persisted capture signature on worker wake. */
export async function getPersistedTabSignature(
  tabId: number
): Promise<TabCaptureSignature | null> {
  if (!storage) return null

  const map = await getSignatureMap()
  return map[String(tabId)] ?? null
}

/** Clean up when a tab is closed. */
export async function removeTabSignature(tabId: number): Promise<void> {
  await updateSignatureMap((map) => {
    delete map[String(tabId)]
  })
}

/** Bulk retrieve all persisted signatures (used on worker cold start). */
export async function getAllPersistedSignatures(): Promise<Record<number, TabCaptureSignature>> {
  if (!storage) return {}

  const map = await getSignatureMap()
  const result: Record<number, TabCaptureSignature> = {}

  for (const [key, value] of Object.entries(map)) {
    const tabId = Number(key)
    if (!Number.isNaN(tabId)) {
      result[tabId] = value
    }
  }

  return result
}

async function getSignatureMap(): Promise<SignatureMap> {
  if (!storage) return {}

  const values = await storage.get(STORAGE_KEY)
  const raw = values[STORAGE_KEY]
  return (raw && typeof raw === "object" && !Array.isArray(raw))
    ? raw as SignatureMap
    : {}
}
