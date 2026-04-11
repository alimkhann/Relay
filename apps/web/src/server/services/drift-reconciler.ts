import type { RepositoryBundle } from "@relay/db"
import type { MemoryItemRow } from "@relay/shared"
import { isSameTopic } from "@relay/shared"

import { emitMemoryEvent } from "./memory-service"

export interface DriftGroup {
  topicKey: string
  items: MemoryItemRow[]
  surfaces: string[]
  winner: MemoryItemRow
  losers: MemoryItemRow[]
}

export interface DriftReconciliationResult {
  driftsDetected: number
  itemsDisputed: number
  groups: DriftGroup[]
}

const DEFAULT_WINDOW_MINUTES = 60
const DEFAULT_EVENT_LIMIT = 200
const CONSIDERED_TYPES = new Set(["decision", "constraint", "fact"])

/**
 * Tails `memory_events` for a project, groups recent writes by topic, and
 * flags cross-surface disagreements. A "drift" is two+ surfaces writing
 * contradictory facts about the same topic inside a short window.
 *
 * Winner = newest `capturedAt` (or `updatedAt` fallback). Losers get
 * `conflictStatus: disputed` in metadata so `get_brief` can surface them.
 *
 * Idempotent: items already marked disputed are skipped. Cheap enough to
 * call from the opportunistic sweep (one query + one join).
 */
export async function detectCrossSurfaceDrifts(
  repositories: RepositoryBundle,
  projectId: string,
  options?: {
    windowMinutes?: number
    userId?: string | null
    markDisputed?: boolean
  },
): Promise<DriftReconciliationResult> {
  const windowMinutes = options?.windowMinutes ?? DEFAULT_WINDOW_MINUTES
  const markDisputed = options?.markDisputed ?? true
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()

  const events = await repositories.memoryEvents.listRecentForProject({
    projectId,
    since,
    eventTypes: ["created", "updated"],
    limit: DEFAULT_EVENT_LIMIT,
  })
  if (events.length === 0) {
    return { driftsDetected: 0, itemsDisputed: 0, groups: [] }
  }

  const itemIds = new Set<string>()
  for (const ev of events) {
    if (ev.memoryItemId) itemIds.add(ev.memoryItemId)
  }
  if (itemIds.size === 0) {
    return { driftsDetected: 0, itemsDisputed: 0, groups: [] }
  }

  const eventBySurface = new Map<string, string>()
  for (const ev of events) {
    if (ev.memoryItemId && ev.sourceSurface && !eventBySurface.has(ev.memoryItemId)) {
      eventBySurface.set(ev.memoryItemId, ev.sourceSurface)
    }
  }

  const items: MemoryItemRow[] = []
  for (const id of itemIds) {
    const row = await repositories.memory.getById(id)
    if (!row || row.isArchived) continue
    if (!CONSIDERED_TYPES.has(row.type)) continue
    items.push(row)
  }
  if (items.length < 2) {
    return { driftsDetected: 0, itemsDisputed: 0, groups: [] }
  }

  const groups: DriftGroup[] = []
  const claimed = new Set<string>()

  for (const base of items) {
    if (claimed.has(base.id)) continue
    const bucket: MemoryItemRow[] = [base]
    for (const candidate of items) {
      if (candidate.id === base.id) continue
      if (claimed.has(candidate.id)) continue
      if (candidate.type !== base.type) continue
      if (isSameTopic(base.content, candidate.content)) {
        bucket.push(candidate)
      }
    }
    if (bucket.length < 2) continue

    const surfaces = new Set<string>()
    for (const it of bucket) {
      const surface = eventBySurface.get(it.id) ?? it.sourceSurface ?? null
      if (surface) surfaces.add(surface)
    }
    if (surfaces.size < 2) continue

    const sorted = [...bucket].sort((a, b) => {
      const at = a.capturedAt ?? a.updatedAt
      const bt = b.capturedAt ?? b.updatedAt
      return bt.localeCompare(at)
    })
    const winner = sorted[0]
    if (!winner) continue
    const losers = sorted.slice(1)

    for (const it of bucket) claimed.add(it.id)

    groups.push({
      topicKey: `${base.type}:${winner.id.slice(0, 8)}`,
      items: bucket,
      surfaces: [...surfaces],
      winner,
      losers,
    })
  }

  let itemsDisputed = 0
  if (markDisputed) {
    for (const group of groups) {
      for (const loser of group.losers) {
        const existingStatus = (loser.metadata ?? {}).conflictStatus
        if (existingStatus === "disputed") continue
        try {
          await repositories.memory.update(loser.id, {
            metadata: {
              ...(loser.metadata ?? {}),
              conflictStatus: "disputed",
              canonicalTopicKey: group.topicKey,
              driftWinnerId: group.winner.id,
              driftSurfaces: group.surfaces,
              validationState: "contested",
            },
          })
          itemsDisputed += 1
          void emitMemoryEvent(repositories, {
            projectId,
            memoryItemId: loser.id,
            eventType: "disputed",
            sourceSurface: null,
            userId: options?.userId ?? null,
            payload: {
              type: loser.type,
              winnerId: group.winner.id,
              surfaces: group.surfaces,
              reason: "cross_surface_drift",
            },
          })
        } catch (error) {
          console.error("[drift-reconciler] failed to mark disputed:", error instanceof Error ? error.message : error)
        }
      }
    }
  }

  return {
    driftsDetected: groups.length,
    itemsDisputed,
    groups,
  }
}

/**
 * Query-only helper for brief assembly: return currently-disputed memory
 * items for a project. No mutation. Used by `get_brief` to show the Drifts
 * section without re-running the expensive grouping pass.
 */
export async function listDisputedItems(
  repositories: RepositoryBundle,
  projectId: string,
  limit = 3,
): Promise<MemoryItemRow[]> {
  const all = await repositories.memory.listByProject(projectId)
  return all
    .filter((item) => {
      const status = (item.metadata ?? {}).conflictStatus
      return status === "disputed" || status === "contested"
    })
    .slice(0, limit)
}
