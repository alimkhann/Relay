import type { MemoryItemType } from "../types/database"
import type { MemoryItemDto, ProjectStateDto, ProjectStateOverrideDto } from "../types/project"
import {
  computeMemoryTruthScore,
  deduplicateMemoryItems,
  mergeGovernedList,
  type MemoryItemForConflictResolution,
} from "./merge-governed"

function applyHidden(items: string[], hidden: string[]) {
  const hiddenKeys = new Set(hidden.map((value) => value.trim().toLowerCase()).filter(Boolean))
  return items.filter((item) => !hiddenKeys.has(item.trim().toLowerCase()))
}

function extractGovernedContext(
  baseItems: string[],
  memory: MemoryItemDto[],
  type: MemoryItemType,
  baseUpdatedAt: string,
) {
  const baseAsMemory: MemoryItemForConflictResolution[] = baseItems.map((item, index) => ({
    id: `derived-${type}-${index}`,
    content: item,
    capturedAt: baseUpdatedAt,
    type,
    metadata: {
      authority: "validated_state",
      durability: type === "task" ? "working" : "foundational",
      validationState: "validated",
      reaffirmedCount: 1,
    },
  }))

  const incomingAsMemory: MemoryItemForConflictResolution[] = memory
    .filter((item) => item.type === type)
    .map((item) => ({
      id: item.id,
      content: item.content,
      capturedAt: item.capturedAt ?? item.updatedAt,
      type,
      pinned: item.pinned,
      sourceSurface: item.sourceSurface,
      metadata: item.metadata ?? {},
    }))

  return deduplicateMemoryItems([...baseAsMemory, ...incomingAsMemory])
    .sort((left, right) => {
      const scoreDiff = computeMemoryTruthScore(right) - computeMemoryTruthScore(left)
      if (scoreDiff !== 0) return scoreDiff
      const rightTime = right.capturedAt ? new Date(right.capturedAt).getTime() : 0
      const leftTime = left.capturedAt ? new Date(left.capturedAt).getTime() : 0
      return rightTime - leftTime
    })
    .map((item) => item.content)
}

export function buildEffectiveProjectState(
  derived: ProjectStateDto | null,
  overrides: ProjectStateOverrideDto | null,
  memory: MemoryItemDto[]
): ProjectStateDto | null {
  if (!derived && !overrides && memory.length === 0) {
    return null
  }

  const base: ProjectStateDto = derived ?? {
    projectOverview: null,
    currentObjective: null,
    stackDomain: null,
    recentProgress: null,
    decisions: [],
    constraints: [],
    openTasks: [],
    relevantTools: [],
    lastBootstrapAt: null,
    dirty: false,
    updatedAt: new Date(0).toISOString()
  }

  return {
    ...base,
    projectOverview:
      overrides?.projectOverviewOverride !== null && overrides?.projectOverviewOverride !== undefined
        ? overrides.projectOverviewOverride
        : base.projectOverview,
    currentObjective:
      overrides?.currentObjectiveOverride !== null && overrides?.currentObjectiveOverride !== undefined
        ? overrides.currentObjectiveOverride
        : base.currentObjective,
    recentProgress:
      overrides?.recentProgressOverride !== null && overrides?.recentProgressOverride !== undefined
        ? overrides.recentProgressOverride
        : base.recentProgress,
    decisions: mergeGovernedList([], extractGovernedContext(applyHidden(base.decisions, overrides?.hiddenDecisions ?? []), memory, "decision", base.updatedAt), "decision"),
    constraints: mergeGovernedList([], extractGovernedContext(applyHidden(base.constraints, overrides?.hiddenConstraints ?? []), memory, "constraint", base.updatedAt), "constraint"),
    openTasks: mergeGovernedList([], extractGovernedContext(applyHidden(base.openTasks, overrides?.hiddenOpenTasks ?? []), memory, "task", base.updatedAt), "task"),
    updatedAt: overrides?.updatedAt ?? base.updatedAt
  }
}
