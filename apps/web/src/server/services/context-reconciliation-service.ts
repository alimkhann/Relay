import type { RepositoryBundle } from "@relay/db"
import type { SessionDigestShape } from "@relay/shared"
import { hasCompletionSignal, isSameTopic, hasReplacementSignal, hasNegationSignal } from "@relay/shared"

export interface ReconciliationResult {
  archivedCount: number
  archivedItems: string[]
}

export async function reconcileAfterDigest(
  repositories: RepositoryBundle,
  projectId: string,
  digest: SessionDigestShape
): Promise<ReconciliationResult> {
  const memoryItems = await repositories.memory.listByProject(projectId)
  const archivedItems: string[] = []

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
    }

    if (item.type === "constraint") {
      shouldArchive = digest.newConstraints.some(
        (c) =>
          isSameTopic(item.content, c) &&
          (hasReplacementSignal(c) || hasNegationSignal(item.content) !== hasNegationSignal(c))
      )
    }

    if (item.type === "task" && digest.recentProgressDelta) {
      shouldArchive =
        hasCompletionSignal(digest.recentProgressDelta) &&
        isSameTopic(item.content, digest.recentProgressDelta)
    }

    if (shouldArchive) {
      await repositories.memory.update(item.id, { isArchived: true })
      archivedItems.push(item.content)
    }
  }

  return {
    archivedCount: archivedItems.length,
    archivedItems
  }
}
