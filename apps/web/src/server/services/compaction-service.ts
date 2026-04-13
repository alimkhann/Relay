import type { CanonEntryRow, MemoryItemRow, ProjectStateRow, ProjectSummarySnapshotRow } from "@relay/shared"
import { hasCompletionSignal, isSameTopic } from "@relay/shared"

export type MemoryCompactionState =
  | "covered_by_canon"
  | "covered_by_summary"
  | "historical_only"
  | "completed"

export interface MemoryCompactionAction {
  type: "keep" | "demote" | "archive"
  state?: MemoryCompactionState
  reason?: string
  metadata?: Record<string, unknown>
}

function asMetadata(item: MemoryItemRow) {
  return (item.metadata ?? {}) as Record<string, unknown>
}

function ageDays(updatedAt: string) {
  return (Date.now() - new Date(updatedAt).getTime()) / 86_400_000
}

function isProtected(item: MemoryItemRow) {
  const metadata = asMetadata(item)
  return item.pinned || metadata.keepInRotation === true || metadata.userProtected === true
}

function hasActiveCanonCoverage(item: MemoryItemRow, canonEntries: CanonEntryRow[]) {
  return canonEntries.find(
    (entry) =>
      entry.status === "active" &&
      ((item.type === "decision" && entry.kind === "decision") ||
        (item.type === "constraint" && entry.kind === "constraint") ||
        (item.type === "task" && entry.kind === "task") ||
        (item.type === "artifact" && entry.kind === "artifact")) &&
      isSameTopic(entry.content, item.content),
  )
}

function hasSummaryCoverage(item: MemoryItemRow, snapshots: ProjectSummarySnapshotRow[]) {
  return snapshots.find(
    (snapshot) =>
      isSameTopic(snapshot.content, item.content) ||
      snapshot.content.toLowerCase().includes(item.content.toLowerCase()) ||
      item.content.toLowerCase().includes(snapshot.content.toLowerCase()),
  )
}

function taskStillOpen(item: MemoryItemRow, state: ProjectStateRow | null) {
  return (state?.openTasks ?? []).some((task) => isSameTopic(task, item.content))
}

export function deriveMemoryCompactionAction(input: {
  item: MemoryItemRow
  canonEntries: CanonEntryRow[]
  snapshots: ProjectSummarySnapshotRow[]
  state: ProjectStateRow | null
  compactionMode?: "light" | "standard" | "aggressive"
}): MemoryCompactionAction {
  const { item, canonEntries, snapshots, state } = input
  const compactionMode = input.compactionMode ?? "standard"
  const metadata = asMetadata(item)

  if (isProtected(item)) {
    return { type: "keep" }
  }

  const itemAgeDays = ageDays(item.updatedAt)
  const activeCanon = hasActiveCanonCoverage(item, canonEntries)
  const summaryCoverage = hasSummaryCoverage(item, snapshots)

  if (item.type === "task") {
    const completed = hasCompletionSignal(item.content)
    const open = taskStillOpen(item, state)

    if ((completed || !open) && itemAgeDays >= (compactionMode === "light" ? 7 : 3)) {
      return {
        type: "archive",
        state: "completed",
        reason: completed ? "completed_task" : "task_absent_from_current_state",
        metadata: {
          compactionState: "completed",
          completedTask: true,
          coveredByCanon: Boolean(activeCanon),
        },
      }
    }

    if (activeCanon && itemAgeDays >= (compactionMode === "aggressive" ? 1 : compactionMode === "light" ? 5 : 2)) {
      return {
        type: "demote",
        state: "covered_by_canon",
        reason: "task_covered_by_canon",
        metadata: {
          compactionState: "covered_by_canon",
          coveredByCanonEntryId: activeCanon.id,
        },
      }
    }
  }

  if ((item.type === "decision" || item.type === "constraint") && activeCanon && itemAgeDays >= (compactionMode === "aggressive" ? 3 : compactionMode === "light" ? 14 : 7)) {
    return {
      type: "demote",
      state: "covered_by_canon",
      reason: `${item.type}_covered_by_canon`,
      metadata: {
        compactionState: "covered_by_canon",
        coveredByCanonEntryId: activeCanon.id,
      },
    }
  }

  if (item.type === "note" && summaryCoverage && itemAgeDays >= (compactionMode === "aggressive" ? 7 : 14)) {
    return {
      type: itemAgeDays >= (compactionMode === "light" ? 45 : 30) ? "archive" : "demote",
      state: "covered_by_summary",
      reason: "note_covered_by_summary",
      metadata: {
        compactionState: "covered_by_summary",
        coveredBySummaryId: summaryCoverage.id,
      },
    }
  }

  if (
    (metadata.conflictStatus === "disputed" || metadata.archivedBy === "digest_replaced") &&
    itemAgeDays >= 14 &&
    (item.type === "decision" || item.type === "constraint")
  ) {
    return {
      type: "demote",
      state: "historical_only",
      reason: "historical_conflict_or_replaced",
      metadata: {
        compactionState: "historical_only",
      },
    }
  }

  return { type: "keep" }
}
