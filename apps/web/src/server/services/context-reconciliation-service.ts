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

export interface ReconciliationResult {
  archivedCount: number
  archivedItems: string[]
  disputedCount: number
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
  digest: SessionDigestShape
): Promise<ReconciliationResult> {
  const memoryItems = await repositories.memory.listByProject(projectId)
  const archivedItems: string[] = []
  const disputedItems = new Set<string>()

  const reconcilableTypes = new Set(["decision", "constraint", "task"])
  const candidates = memoryItems.filter(
    (item) => reconcilableTypes.has(item.type) && !item.pinned
  )

  for (const item of candidates) {
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
    }
  }

  return {
    archivedCount: archivedItems.length,
    archivedItems,
    disputedCount: disputedItems.size,
  }
}
