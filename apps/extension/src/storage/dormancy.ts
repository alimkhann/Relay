const localStorageArea = typeof chrome !== "undefined" ? chrome.storage.local : null

export const DORMANT_AFTER_MS = 48 * 60 * 60 * 1_000
export const DORMANT_AUTO_WAKE_DAILY_LIMIT = 2

const keys = {
  lastMeaningfulActivityAt: "relay.dormancy.lastMeaningfulActivityAt",
  lastMeaningfulActivityKind: "relay.dormancy.lastMeaningfulActivityKind",
  enteredDormantAt: "relay.dormancy.enteredDormantAt",
  autoWakeAttempts: "relay.dormancy.autoWakeAttempts",
} as const

export type RelayActivitySource =
  | "background"
  | "content_script"
  | "extension_chat"
  | "inline_chip"
  | "shortcut"
  | "sidepanel"

export type RelayMeaningfulActivityKind =
  | "ask_relay_used"
  | "auto_capture_completed"
  | "insert_brief"
  | "manual_capture"
  | "onboarding_action"
  | "project_selected"
  | "save_selection"
  | "settings_action"
  | "sidepanel_opened"

const validActivityKinds = new Set<RelayMeaningfulActivityKind>([
  "ask_relay_used",
  "auto_capture_completed",
  "insert_brief",
  "manual_capture",
  "onboarding_action",
  "project_selected",
  "save_selection",
  "settings_action",
  "sidepanel_opened",
])

export interface RelayDormantAutoWakeAttempts {
  day: string | null
  count: number
  signatures: Record<string, number>
}

export interface RelayDormancyState {
  lastMeaningfulActivityAt: number | null
  lastMeaningfulActivityKind: RelayMeaningfulActivityKind | null
  enteredDormantAt: number | null
  autoWakeAttempts: RelayDormantAutoWakeAttempts
}

export function createEmptyDormancyState(): RelayDormancyState {
  return {
    lastMeaningfulActivityAt: null,
    lastMeaningfulActivityKind: null,
    enteredDormantAt: null,
    autoWakeAttempts: {
      day: null,
      count: 0,
      signatures: {},
    },
  }
}

function asTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null
}

function asActivityKind(value: unknown): RelayMeaningfulActivityKind | null {
  return typeof value === "string" && validActivityKinds.has(value as RelayMeaningfulActivityKind)
    ? (value as RelayMeaningfulActivityKind)
    : null
}

function normalizeAutoWakeAttempts(value: unknown): RelayDormantAutoWakeAttempts {
  if (!value || typeof value !== "object") {
    return createEmptyDormancyState().autoWakeAttempts
  }
  const input = value as Partial<RelayDormantAutoWakeAttempts>
  return {
    day: typeof input.day === "string" ? input.day : null,
    count: typeof input.count === "number" && Number.isFinite(input.count)
      ? Math.max(0, input.count)
      : 0,
    signatures:
      input.signatures && typeof input.signatures === "object"
        ? Object.fromEntries(
            Object.entries(input.signatures).filter(
              ([signature, seenAt]) =>
                signature && typeof seenAt === "number" && Number.isFinite(seenAt),
            ),
          )
        : {},
  }
}

function normalizeDormancyState(values: Record<string, unknown>): RelayDormancyState {
  return {
    lastMeaningfulActivityAt: asTimestamp(values[keys.lastMeaningfulActivityAt]),
    lastMeaningfulActivityKind: asActivityKind(values[keys.lastMeaningfulActivityKind]),
    enteredDormantAt: asTimestamp(values[keys.enteredDormantAt]),
    autoWakeAttempts: normalizeAutoWakeAttempts(values[keys.autoWakeAttempts]),
  }
}

function dayKey(now: number) {
  return new Date(now).toISOString().slice(0, 10)
}

function attemptsForDay(
  attempts: RelayDormantAutoWakeAttempts,
  now: number,
): RelayDormantAutoWakeAttempts {
  const today = dayKey(now)
  if (attempts.day === today) {
    return attempts
  }
  return {
    day: today,
    count: 0,
    signatures: {},
  }
}

export function isDormant(now: number, state: RelayDormancyState) {
  if (!state.lastMeaningfulActivityAt) {
    return true
  }
  return now - state.lastMeaningfulActivityAt >= DORMANT_AFTER_MS
}

export function applyMeaningfulActivity(
  state: RelayDormancyState,
  kind: RelayMeaningfulActivityKind,
  now = Date.now(),
): RelayDormancyState {
  return {
    ...state,
    lastMeaningfulActivityAt: now,
    lastMeaningfulActivityKind: kind,
    enteredDormantAt: null,
  }
}

export function canAttemptDormantAutoWake(
  state: RelayDormancyState,
  signature: string | null | undefined,
  now = Date.now(),
) {
  if (!signature) return false
  const attempts = attemptsForDay(state.autoWakeAttempts, now)
  if (attempts.signatures[signature]) return false
  return attempts.count < DORMANT_AUTO_WAKE_DAILY_LIMIT
}

export function applyDormantAutoWakeAttempt(
  state: RelayDormancyState,
  signature: string,
  now = Date.now(),
): RelayDormancyState {
  const attempts = attemptsForDay(state.autoWakeAttempts, now)
  if (attempts.signatures[signature]) {
    return {
      ...state,
      autoWakeAttempts: attempts,
    }
  }
  return {
    ...state,
    autoWakeAttempts: {
      day: attempts.day,
      count: attempts.count + 1,
      signatures: {
        ...attempts.signatures,
        [signature]: now,
      },
    },
  }
}

export function isExplicitActivitySource(source: RelayActivitySource | null | undefined) {
  return source === "sidepanel" || source === "extension_chat" || source === "inline_chip" || source === "shortcut"
}

export function trustedDormancySourceFromMessage(
  source: RelayActivitySource | null | undefined,
  sender: { tab?: { id?: number | null }; url?: string | null } | null | undefined,
): RelayActivitySource | undefined {
  if (!source) return undefined

  const senderUrl = sender?.url
  const isExtensionPage =
    typeof senderUrl === "string" &&
    (senderUrl.startsWith("chrome-extension://") || senderUrl.startsWith("moz-extension://"))
  if (isExtensionPage) {
    return source === "sidepanel" || source === "extension_chat" || source === "background"
      ? source
      : undefined
  }

  if (typeof sender?.tab?.id === "number") {
    return source === "inline_chip" || source === "shortcut"
      ? source
      : "content_script"
  }

  if (source === "sidepanel" || source === "extension_chat" || source === "background") {
    return source
  }

  return undefined
}

export function shouldSkipRemoteSyncForDormancy(input: {
  dormant: boolean
  reason?: string | null
  source?: RelayActivitySource | null
}) {
  if (!input.dormant) return false
  if (isExplicitActivitySource(input.source)) return false
  return true
}

export async function readDormancyState(): Promise<RelayDormancyState> {
  if (!localStorageArea) {
    return createEmptyDormancyState()
  }
  try {
    const values = await localStorageArea.get(Object.values(keys))
    return normalizeDormancyState(values)
  } catch (cause) {
    console.warn("[Relay] failed to read dormancy state", cause)
    return createEmptyDormancyState()
  }
}

async function writeDormancyState(state: RelayDormancyState) {
  if (!localStorageArea) return
  try {
    await localStorageArea.set({
      [keys.lastMeaningfulActivityAt]: state.lastMeaningfulActivityAt,
      [keys.lastMeaningfulActivityKind]: state.lastMeaningfulActivityKind,
      [keys.enteredDormantAt]: state.enteredDormantAt,
      [keys.autoWakeAttempts]: state.autoWakeAttempts,
    })
  } catch (cause) {
    console.warn("[Relay] failed to write dormancy state", cause)
  }
}

export async function readDormancySnapshot(now = Date.now()) {
  let state = await readDormancyState()
  const dormant = isDormant(now, state)
  if (dormant && !state.enteredDormantAt) {
    state = {
      ...state,
      enteredDormantAt: now,
    }
    await writeDormancyState(state)
  }
  return {
    state,
    dormant,
  }
}

export async function markMeaningfulActivity(
  kind: RelayMeaningfulActivityKind,
  now = Date.now(),
) {
  const next = applyMeaningfulActivity(await readDormancyState(), kind, now)
  await writeDormancyState(next)
  return next
}

export async function rememberDormantAutoWakeAttempt(
  signature: string,
  now = Date.now(),
) {
  const next = applyDormantAutoWakeAttempt(await readDormancyState(), signature, now)
  await writeDormancyState(next)
  return next
}
