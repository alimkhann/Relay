import type { RepositoryBundle } from "@relay/db"
import type { MemoryItemRow, SessionDigestShape } from "@relay/shared"
import {
  hasCompletionSignal,
  hasNegationSignal,
  hasReplacementSignal,
  hashContent,
  isLikelySameTopic,
  isSameTopic,
} from "@relay/shared"

import { emitMemoryEvent } from "./memory-service"

export interface ReconciliationResult {
  archivedCount: number
  archivedItems: string[]
  disputedCount: number
  reaffirmedCount: number
  supersedesEdges: number
}

export interface TruthMaintenanceArchiveDecision {
  id: string
  reason: string
}

function findSupersedingNewItem(
  newItems: MemoryItemRow[] | undefined,
  old: MemoryItemRow,
): MemoryItemRow | undefined {
  if (!newItems?.length) return undefined
  return newItems.find(
    (next) =>
      next.type === old.type &&
      !next.isArchived &&
      next.id !== old.id &&
      isSameTopic(next.content, old.content),
  )
}

function buildTopicKey(item: MemoryItemRow, candidate: string) {
  return `${item.type}:${hashContent(item.content.length >= candidate.length ? item.content : candidate).slice(0, 12)}`
}

function mergeMetadata(item: MemoryItemRow, patch: Record<string, unknown>) {
  return {
    ...(item.metadata ?? {}),
    ...patch,
  }
}

export async function reconcileAfterDigest(
  repositories: RepositoryBundle,
  projectId: string,
  digest: SessionDigestShape,
  options?: {
    newItems?: MemoryItemRow[]
    userId?: string | null
    sourceSurface?: string | null
    truthMaintenanceArchive?: TruthMaintenanceArchiveDecision[]
  }
): Promise<ReconciliationResult> {
  const actor = options?.userId ?? null
  const surface = options?.sourceSurface ?? null
  const memoryItems = await repositories.memory.listByProject(projectId)
  const archivedItems: string[] = []
  const disputedItems = new Set<string>()
  const truthMaintenanceArchivedIds = new Set<string>()
  let supersedesEdges = 0

  const reconcilableTypes = new Set(["decision", "constraint", "task"])
  const candidates = memoryItems.filter(
    (item) => reconcilableTypes.has(item.type) && !item.pinned
  )

  if (options?.truthMaintenanceArchive?.length) {
    const candidatesById = new Map(
      candidates
        .filter((item) => !item.isArchived)
        .map((item) => [item.id, item]),
    )
    const seenArchiveIds = new Set<string>()

    for (const decision of options.truthMaintenanceArchive) {
      if (seenArchiveIds.has(decision.id)) continue
      seenArchiveIds.add(decision.id)
      const item = candidatesById.get(decision.id)
      if (!item || item.projectId !== projectId) continue

      await repositories.memory.update(item.id, {
        isArchived: true,
        metadata: mergeMetadata(item, {
          archivedBy: "truth_maintenance",
          archivedReason: decision.reason || "truth_maintenance",
          conflictStatus: "superseded",
          validationState: "superseded",
        }),
      })
      archivedItems.push(item.content)
      truthMaintenanceArchivedIds.add(item.id)

      void emitMemoryEvent(repositories, {
        projectId,
        memoryItemId: item.id,
        eventType: "archived",
        sourceSurface: surface,
        userId: actor,
        payload: { type: item.type, reason: decision.reason || "truth_maintenance" },
      })
    }
  }

  for (const item of candidates) {
    if (truthMaintenanceArchivedIds.has(item.id)) continue
    let shouldArchive = false

    if (item.type === "decision") {
      shouldArchive = digest.newDecisions.some(
        (d) =>
          isSameTopic(item.content, d) &&
          (hasReplacementSignal(d) || hasNegationSignal(item.content) !== hasNegationSignal(d))
      )

      if (!shouldArchive) {
        const disputedWith = digest.newDecisions.find(
          (d) => isLikelySameTopic(item.content, d) || (isSameTopic(item.content, d) && item.content !== d),
        )
        if (disputedWith) {
          await repositories.memory.update(item.id, {
            metadata: mergeMetadata(item, {
              conflictStatus: "disputed",
              canonicalTopicKey: buildTopicKey(item, disputedWith),
              validationState: "contested",
            }),
          })
          disputedItems.add(item.id)
          void emitMemoryEvent(repositories, {
            projectId,
            memoryItemId: item.id,
            eventType: "disputed",
            sourceSurface: surface,
            userId: actor,
            payload: { type: item.type, disputedWith },
          })
        }
      }
    }

    if (item.type === "constraint") {
      shouldArchive = digest.newConstraints.some(
        (c) =>
          isSameTopic(item.content, c) &&
          (hasReplacementSignal(c) || hasNegationSignal(item.content) !== hasNegationSignal(c))
      )

      if (!shouldArchive) {
        const disputedWith = digest.newConstraints.find(
          (c) => isLikelySameTopic(item.content, c) || (isSameTopic(item.content, c) && item.content !== c),
        )
        if (disputedWith) {
          await repositories.memory.update(item.id, {
            metadata: mergeMetadata(item, {
              conflictStatus: "disputed",
              canonicalTopicKey: buildTopicKey(item, disputedWith),
              validationState: "contested",
            }),
          })
          disputedItems.add(item.id)
          void emitMemoryEvent(repositories, {
            projectId,
            memoryItemId: item.id,
            eventType: "disputed",
            sourceSurface: surface,
            userId: actor,
            payload: { type: item.type, disputedWith },
          })
        }
      }
    }

    if (item.type === "task" && digest.recentProgressDelta) {
      shouldArchive =
        hasCompletionSignal(digest.recentProgressDelta) &&
        isSameTopic(item.content, digest.recentProgressDelta)
    }

    if (shouldArchive) {
      await repositories.memory.update(item.id, {
        isArchived: true,
        metadata: mergeMetadata(item, {
          conflictStatus: "superseded",
          archivedReason: "digest_replaced",
          validationState: "superseded",
        }),
      })
      archivedItems.push(item.content)

      // Wire memory_relations.supersedes: new item invalidates old. Lets
      // hybridSearch's supersedes-aware filter hide the old item and the
      // brief surface the newer fact with traceable provenance.
      const superseder = findSupersedingNewItem(options?.newItems, item)
      if (superseder) {
        try {
          await repositories.memory.addRelation(superseder.id, item.id, "supersedes", 0.85)
          supersedesEdges += 1
          void emitMemoryEvent(repositories, {
            projectId,
            memoryItemId: superseder.id,
            eventType: "superseded",
            sourceSurface: surface,
            userId: actor,
            payload: { type: item.type, targetId: item.id, confidence: 0.85 },
          })
        } catch {
          // Relation already exists or source/target archived race — ignore.
        }
      }

      void emitMemoryEvent(repositories, {
        projectId,
        memoryItemId: item.id,
        eventType: "archived",
        sourceSurface: surface,
        userId: actor,
        payload: { type: item.type, reason: "digest_replaced" },
      })
    }
  }

  // Reaffirmation pass: boost items that appear in digest without contradiction
  const digestTexts = [
    ...digest.newDecisions,
    ...digest.newConstraints,
    ...(digest.newTasks ?? []),
  ]
  let reaffirmedCount = 0
  const archivedSet = new Set(archivedItems)
  for (const item of candidates) {
    if (truthMaintenanceArchivedIds.has(item.id)) continue
    if (archivedSet.has(item.content)) continue
    if (disputedItems.has(item.id)) continue
    const reaffirmed = digestTexts.some(
      (text) => isSameTopic(item.content, text) && !hasReplacementSignal(text) && !hasNegationSignal(text),
    )
    if (reaffirmed) {
      await repositories.memory.reaffirm(item.id)
      reaffirmedCount += 1
      void emitMemoryEvent(repositories, {
        projectId,
        memoryItemId: item.id,
        eventType: "reaffirmed",
        sourceSurface: surface,
        userId: actor,
        payload: { type: item.type },
      })
    }
  }

  return {
    archivedCount: archivedItems.length,
    archivedItems,
    disputedCount: disputedItems.size,
    reaffirmedCount,
    supersedesEdges,
  }
}
