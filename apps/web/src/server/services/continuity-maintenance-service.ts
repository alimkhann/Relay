import { createRepositoryBundle, type RepositoryBundle } from "@relay/db"
import type { MemoryItemRow, WorkSessionRow } from "@relay/shared"
import {
  hasCompletionSignal,
  hashContent,
  isLikelySameTopic,
  isSameTopic,
} from "@relay/shared"

import { adjudicateGreyZoneConflict } from "./conflict-adjudication-service"
import { deriveMemoryCompactionAction } from "./compaction-service"

const BROWSER_SURFACES: WorkSessionRow["surface"][] = [
  "chatgpt",
  "claude",
  "gemini",
  "grok",
  "perplexity",
  "deepseek",
  "codex",
]

function mergeMetadata(
  current: Record<string, unknown> | undefined,
  patch: Record<string, unknown>,
) {
  return {
    ...(current ?? {}),
    ...patch,
  }
}

function asMetadata(item: MemoryItemRow) {
  return (item.metadata ?? {}) as Record<string, unknown>
}

function buildTopicKey(type: MemoryItemRow["type"], content: string) {
  return `${type}:${hashContent(content).slice(0, 12)}`
}

function getRecentReaffirmationMatches(
  item: MemoryItemRow,
  checkpointTexts: string[],
) {
  return checkpointTexts.filter((value) => isSameTopic(item.content, value)).length
}

export interface ContinuityMaintenanceResult {
  projectId: string
  archivedTaskCount: number
  reaffirmedCount: number
  disputedCount: number
  staleSessionsMarked: number
}

async function runContinuityMaintenanceForProjectWithRepositories(
  repositories: RepositoryBundle,
  projectId: string,
): Promise<ContinuityMaintenanceResult> {
  const [memoryItems, checkpoints, canonEntries, summarySnapshots, projectState, projectSettings] = await Promise.all([
    repositories.memory.listByProject(projectId),
    repositories.workSessionCheckpoints.listRecentByProject(projectId, {
      limit: 20,
      surfaces: ["mcp", "cli", ...BROWSER_SURFACES],
    }),
    repositories.canonEntries.listByProject(projectId, { statuses: ["active", "tentative", "disputed", "superseded"], limit: 200 }),
    repositories.projectSummarySnapshots.listLatestByProject(projectId, { limit: 40 }),
    repositories.projectState.getByProject(projectId),
    repositories.projectSettings.getByProject(projectId),
  ])

  const reaffirmationTexts = checkpoints.flatMap((checkpoint) => {
    const state = checkpoint.structuredState ?? {}
    return [
      ...(Array.isArray(state.decisions) ? state.decisions.map(String) : []),
      ...(Array.isArray(state.constraints) ? state.constraints.map(String) : []),
      ...(Array.isArray(state.nextSteps) ? state.nextSteps.map(String) : []),
      ...(Array.isArray(state.reaffirmedFacts) ? state.reaffirmedFacts.map(String) : []),
    ]
  })

  let reaffirmedCount = 0
  for (const item of memoryItems) {
    const matches = getRecentReaffirmationMatches(item, reaffirmationTexts)
    if (matches <= 0) continue

    const metadata = asMetadata(item)
    const currentCount = typeof metadata.reaffirmedCount === "number" ? metadata.reaffirmedCount : 0
    await repositories.memory.update(item.id, {
      metadata: mergeMetadata(metadata, {
        reaffirmedCount: currentCount + matches,
        lastValidatedAt: new Date().toISOString(),
        validationState: metadata.validationState === "validated" ? "validated" : "confirmed",
      }),
    })
    await repositories.memory.reaffirm(item.id)
    reaffirmedCount += 1
  }

  const reconcilable = memoryItems.filter((item) => ["decision", "constraint", "task"].includes(item.type))
  const disputesByItemId = new Map<string, { topicKey: string; conflictingWith: Set<string> }>()
  let adjudicationsUsed = 0

  for (let i = 0; i < reconcilable.length; i += 1) {
    const left = reconcilable[i]
    if (!left) continue
    for (let j = i + 1; j < reconcilable.length; j += 1) {
      const right = reconcilable[j]
      if (!right || left.type !== right.type) continue

      const sameTopic = isSameTopic(left.content, right.content)
      let likelySameTopic = isLikelySameTopic(left.content, right.content)
      if (!sameTopic && !likelySameTopic) continue

      if (!sameTopic && likelySameTopic && adjudicationsUsed < 6) {
        adjudicationsUsed += 1
        const adjudication = await adjudicateGreyZoneConflict({
          left: {
            id: left.id,
            type: left.type as "decision" | "constraint" | "task",
            content: left.content,
            sourceSurface: left.sourceSurface,
            metadata: left.metadata,
          },
          right: {
            id: right.id,
            type: right.type as "decision" | "constraint" | "task",
            content: right.content,
            sourceSurface: right.sourceSurface,
            metadata: right.metadata,
          },
        }).catch(() => null)

        if (adjudication?.verdict === "distinct") {
          continue
        }

        if (adjudication?.reason) {
          await repositories.memory.update(left.id, {
            metadata: mergeMetadata(asMetadata(left), {
              aiGreyZoneReviewedAt: new Date().toISOString(),
              aiGreyZoneReason: adjudication.reason,
            }),
          })
          await repositories.memory.update(right.id, {
            metadata: mergeMetadata(asMetadata(right), {
              aiGreyZoneReviewedAt: new Date().toISOString(),
              aiGreyZoneReason: adjudication.reason,
            }),
          })
        }

        likelySameTopic = adjudication?.verdict === "same" || adjudication?.verdict === "conflicting"
      }

      const canonicalTopicKey = buildTopicKey(left.type, left.content.length >= right.content.length ? left.content : right.content)

      const isConflict = likelySameTopic || left.content !== right.content
      if (!isConflict) continue

      const leftEntry = disputesByItemId.get(left.id) ?? {
        topicKey: canonicalTopicKey,
        conflictingWith: new Set<string>(),
      }
      leftEntry.conflictingWith.add(right.id)
      disputesByItemId.set(left.id, leftEntry)

      const rightEntry = disputesByItemId.get(right.id) ?? {
        topicKey: canonicalTopicKey,
        conflictingWith: new Set<string>(),
      }
      rightEntry.conflictingWith.add(left.id)
      disputesByItemId.set(right.id, rightEntry)
    }
  }

  for (const item of reconcilable) {
    const dispute = disputesByItemId.get(item.id)
    if (!dispute) continue
    const metadata = asMetadata(item)
    await repositories.memory.update(item.id, {
      metadata: mergeMetadata(metadata, {
        conflictStatus: "disputed",
        canonicalTopicKey: dispute.topicKey,
        conflictingWith: Array.from(dispute.conflictingWith),
        validationState: metadata.validationState === "validated" ? "validated" : "contested",
      }),
    })
  }

  for (const item of reconcilable) {
    if (disputesByItemId.has(item.id)) continue
    const metadata = asMetadata(item)
    if (!metadata.conflictStatus && !metadata.conflictingWith) continue
    await repositories.memory.update(item.id, {
      metadata: mergeMetadata(metadata, {
        conflictStatus: null,
        canonicalTopicKey: null,
        conflictingWith: [],
        validationState: metadata.validationState === "contested" ? "inferred" : metadata.validationState,
      }),
    })
  }

  const staleThreshold = Date.now() - 21 * 24 * 60 * 60 * 1000
  let archivedTaskCount = 0
  for (const item of memoryItems) {
    if (item.type !== "task" || item.pinned) continue
    const metadata = asMetadata(item)
    const reaffirmedCountValue = typeof metadata.reaffirmedCount === "number" ? metadata.reaffirmedCount : 0
    if (reaffirmedCountValue > 0) continue
    if (new Date(item.updatedAt).getTime() >= staleThreshold) continue
    if (hasCompletionSignal(item.content)) continue

    await repositories.memory.update(item.id, {
      isArchived: true,
      metadata: mergeMetadata(metadata, {
        archivedReason: "stale_unreaffirmed_task",
      }),
    })
    archivedTaskCount += 1
  }

  const staleBefore = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
  let staleSessionsMarked = 0
  for (const surface of BROWSER_SURFACES) {
    staleSessionsMarked += await repositories.workSessions.markStaleOlderThan({
      projectId,
      surface,
      olderThan: staleBefore,
      clientName: "relay-extension",
    })
  }

  for (const item of memoryItems) {
    const action = deriveMemoryCompactionAction({
      item,
      canonEntries,
      snapshots: summarySnapshots,
      state: projectState,
      compactionMode: projectSettings?.settings.compactionMode ?? "standard",
    })

    if (action.type === "keep") continue

    const metadata = mergeMetadata(asMetadata(item), {
      ...(action.metadata ?? {}),
      compactionReason: action.reason ?? null,
      compactedAt: new Date().toISOString(),
    })

    if (action.type === "archive") {
      await repositories.memory.update(item.id, {
        isArchived: true,
        metadata: mergeMetadata(metadata, {
          archivedReason: action.reason ?? "compaction",
        }),
      })
      continue
    }

    await repositories.memory.update(item.id, {
      metadata,
    })
  }

  await repositories.bootstrapPackets.clearProject(projectId)

  return {
    projectId,
    archivedTaskCount,
    reaffirmedCount,
    disputedCount: disputesByItemId.size,
    staleSessionsMarked,
  }
}

export async function runContinuityMaintenanceForProject(
  userId: string,
  projectId: string,
): Promise<ContinuityMaintenanceResult> {
  const repositories = createRepositoryBundle(userId)
  return runContinuityMaintenanceForProjectWithRepositories(repositories, projectId)
}

export async function runContinuityMaintenanceForUser(
  userId: string,
  input: { projectId?: string; limit?: number } = {},
) {
  const repositories = createRepositoryBundle(userId)
  const project = input.projectId ? await repositories.projects.getById(input.projectId) : null
  const projects = project
    ? [project]
    : (await repositories.projects.listByOwner(userId)).slice(0, input.limit ?? 8)

  const results: ContinuityMaintenanceResult[] = []
  for (const project of projects) {
    if (!project) continue
    results.push(await runContinuityMaintenanceForProjectWithRepositories(repositories, project.id))
  }

  return results
}

export { runContinuityMaintenanceForProjectWithRepositories }
