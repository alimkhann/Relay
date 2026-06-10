import type { SupportedPlatform } from "@relay/shared"

import type { RelayPageState } from "../messaging/contracts"

const storage = typeof chrome !== "undefined" ? chrome.storage.local : null

const keys = {
  approvedAssociations: "relay.routing.approvedAssociations",
  ignoredChatKeys: "relay.routing.ignoredChatKeys",
  adjudications: "relay.routing.adjudications",
  manualOverrides: "relay.routing.manualOverrides"
} as const

const MAX_APPROVED_ASSOCIATIONS = 80
const MAX_IGNORED_CHAT_KEYS = 40
const MAX_ADJUDICATIONS = 120
const MAX_MANUAL_OVERRIDES = 60

export interface RelayApprovedAssociation {
  key: string
  projectId: string
  projectName: string
  projectSlug: string | null
  platform: SupportedPlatform | null
  domain: string | null
  pathname: string | null
  pageFingerprint: string | null
  sourceConversationId: string | null
  url: string | null
  title: string | null
  recentUserTurnText: string | null
  sessionId: string | null
  approvedAt: string
}

interface RelayRoutingMemory {
  approvedAssociations: RelayApprovedAssociation[]
  ignoredChatKeys: string[]
  adjudications: RelayAssociationAdjudication[]
}

export interface RelayAssociationAdjudication {
  key: string
  captureSignature: string | null
  projectId: string | null
  decision: "auto-save" | "hold" | "ignore"
  confidence: "high" | "medium" | "low"
  reasons: string[]
  adjudicatedAt: string
}

function normalizeApprovedAssociation(input: RelayApprovedAssociation): RelayApprovedAssociation {
  return {
    ...input,
    projectSlug: input.projectSlug ?? null,
    platform: input.platform ?? null,
    domain: input.domain ?? null,
    pathname: input.pathname ?? null,
    pageFingerprint: input.pageFingerprint ?? null,
    sourceConversationId: input.sourceConversationId ?? null,
    url: input.url ?? null,
    title: input.title ?? null,
    recentUserTurnText: input.recentUserTurnText ?? null,
    sessionId: input.sessionId ?? null
  }
}

/**
 * A fresh chat has no stable conversation id, so its key is a pre-id `:path:` /
 * `:url:` form. Once the platform assigns an id (e.g. Perplexity navigates
 * `/` → `/search/{id}` after the first answer), the key flips to a stable
 * `:conversation:` / `:fingerprint:` form ON THE SAME TAB. That's the same chat
 * gaining an id — NOT a navigation to a different conversation — so a manual
 * project override must migrate to the new key, not be dropped (else Personal
 * reverts to the domain binding right after the first answer).
 */
export function isFreshChatKeyUpgrade(oldKey: string, newKey: string): boolean {
  const oldPlatform = oldKey.split(":", 1)[0]
  const newPlatform = newKey.split(":", 1)[0]
  if (oldPlatform !== newPlatform) return false
  const oldIsPreId = oldKey.includes(":path:") || oldKey.includes(":url:")
  const newIsStable = newKey.includes(":conversation:") || newKey.includes(":fingerprint:")
  return oldIsPreId && newIsStable
}

export function buildChatLookupKey(page: Pick<RelayPageState, "platform" | "pageFingerprint" | "pathname" | "url" | "sourceConversationId">) {
  const platform = page.platform ?? "unknown"
  const sourceConversationId = page.sourceConversationId?.trim()
  if (sourceConversationId) {
    return `${platform}:conversation:${sourceConversationId}`
  }
  const fingerprint = page.pageFingerprint?.trim()
  if (fingerprint) {
    return `${platform}:fingerprint:${fingerprint}`
  }

  const pathname = page.pathname?.trim()
  if (pathname) {
    return `${platform}:path:${pathname}`
  }

  return `${platform}:url:${page.url ?? ""}`
}

async function getRoutingMemory(): Promise<RelayRoutingMemory> {
  if (!storage) {
    return {
      approvedAssociations: [],
      ignoredChatKeys: [],
      adjudications: []
    }
  }

  const values = await storage.get(Object.values(keys))
  return {
    approvedAssociations: Array.isArray(values[keys.approvedAssociations])
      ? (values[keys.approvedAssociations] as RelayApprovedAssociation[]).map(normalizeApprovedAssociation)
      : [],
    ignoredChatKeys: Array.isArray(values[keys.ignoredChatKeys])
      ? (values[keys.ignoredChatKeys] as string[])
      : [],
    adjudications: Array.isArray(values[keys.adjudications])
      ? (values[keys.adjudications] as RelayAssociationAdjudication[])
      : []
  }
}

async function setRoutingMemory(input: Partial<RelayRoutingMemory>) {
  if (!storage) return

  const payload: Record<string, unknown> = {}
  if (input.approvedAssociations !== undefined) {
    payload[keys.approvedAssociations] = input.approvedAssociations.slice(0, MAX_APPROVED_ASSOCIATIONS)
  }
  if (input.ignoredChatKeys !== undefined) {
    payload[keys.ignoredChatKeys] = input.ignoredChatKeys.slice(0, MAX_IGNORED_CHAT_KEYS)
  }
  if (input.adjudications !== undefined) {
    payload[keys.adjudications] = input.adjudications.slice(0, MAX_ADJUDICATIONS)
  }

  if (Object.keys(payload).length > 0) {
    await storage.set(payload)
  }
}

export async function readApprovedAssociations() {
  const memory = await getRoutingMemory()
  return memory.approvedAssociations
}

export async function isIgnoredChatKey(key: string) {
  const memory = await getRoutingMemory()
  return memory.ignoredChatKeys.includes(key)
}

export async function rememberApprovedAssociation(input: RelayApprovedAssociation) {
  const memory = await getRoutingMemory()
  const next = [
    normalizeApprovedAssociation(input),
    ...memory.approvedAssociations.filter(
      (candidate) =>
        candidate.key !== input.key &&
        !(input.sessionId && candidate.sessionId === input.sessionId)
    )
  ]

  await setRoutingMemory({
    approvedAssociations: next,
    ignoredChatKeys: memory.ignoredChatKeys.filter((candidate) => candidate !== input.key)
  })
}

export async function rememberIgnoredChatKey(key: string) {
  const memory = await getRoutingMemory()
  await setRoutingMemory({
    ignoredChatKeys: [key, ...memory.ignoredChatKeys.filter((candidate) => candidate !== key)]
  })
}

export async function clearIgnoredChatKey(key: string) {
  const memory = await getRoutingMemory()
  await setRoutingMemory({
    ignoredChatKeys: memory.ignoredChatKeys.filter((candidate) => candidate !== key)
  })
}

export async function readAssociationAdjudication(key: string, captureSignature: string | null) {
  const memory = await getRoutingMemory()
  return memory.adjudications.find(
    (candidate) => candidate.key === key && candidate.captureSignature === captureSignature,
  ) ?? null
}

export async function rememberAssociationAdjudication(input: RelayAssociationAdjudication) {
  const memory = await getRoutingMemory()
  await setRoutingMemory({
    adjudications: [
      input,
      ...memory.adjudications.filter(
        (candidate) => !(candidate.key === input.key && candidate.captureSignature === input.captureSignature),
      ),
    ],
  })
}

export async function removeApprovedAssociationBySession(sessionId: string) {
  const memory = await getRoutingMemory()
  await setRoutingMemory({
    approvedAssociations: memory.approvedAssociations.filter((candidate) => candidate.sessionId !== sessionId)
  })
}

// ── Manual project overrides ──────────────────────────────────────
// A manual "switch to project" on a supported chat must win over the
// chat's auto-derived association and survive re-syncs of the SAME chat.
// Keyed by chat lookup key so it never clobbers other tabs/chats. Bounded;
// dropped when the user navigates to a different conversation.
export interface RelayManualOverride {
  projectId: string
  updatedAt: string
}

async function getManualOverrides(): Promise<Record<string, RelayManualOverride>> {
  if (!storage) return {}
  const values = await storage.get(keys.manualOverrides)
  const raw = values[keys.manualOverrides]
  return raw && typeof raw === "object" ? (raw as Record<string, RelayManualOverride>) : {}
}

export async function readManualOverride(chatKey: string): Promise<RelayManualOverride | null> {
  if (!chatKey) return null
  const overrides = await getManualOverrides()
  return overrides[chatKey] ?? null
}

export async function rememberManualOverride(chatKey: string, projectId: string) {
  if (!storage || !chatKey) return
  const overrides = await getManualOverrides()
  overrides[chatKey] = { projectId, updatedAt: new Date().toISOString() }

  // Bound the map: keep the most recent MAX_MANUAL_OVERRIDES entries.
  const entries = Object.entries(overrides).sort(
    ([, a], [, b]) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
  const bounded = Object.fromEntries(entries.slice(0, MAX_MANUAL_OVERRIDES))
  await storage.set({ [keys.manualOverrides]: bounded })
}

export async function clearManualOverride(chatKey: string) {
  if (!storage || !chatKey) return
  const overrides = await getManualOverrides()
  if (!(chatKey in overrides)) return
  delete overrides[chatKey]
  await storage.set({ [keys.manualOverrides]: overrides })
}
