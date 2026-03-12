import type { MemoryItemType } from "../types/database"
import type { MemoryItemDto, ProjectStateDto, ProjectStateOverrideDto } from "../types/project"

function dedupe(items: string[]) {
  const seen = new Set<string>()
  const next: string[] = []

  for (const item of items.map((value) => value.trim()).filter(Boolean)) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(item)
  }

  return next
}

function applyHidden(items: string[], hidden: string[]) {
  const hiddenKeys = new Set(hidden.map((value) => value.trim().toLowerCase()).filter(Boolean))
  return items.filter((item) => !hiddenKeys.has(item.trim().toLowerCase()))
}

function manualContext(memory: MemoryItemDto[], type: MemoryItemType) {
  return memory
    .filter((item) => item.type === type)
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
    decisions: dedupe([
      ...applyHidden(base.decisions, overrides?.hiddenDecisions ?? []),
      ...manualContext(memory, "decision")
    ]),
    constraints: dedupe([
      ...applyHidden(base.constraints, overrides?.hiddenConstraints ?? []),
      ...manualContext(memory, "constraint")
    ]),
    openTasks: dedupe([
      ...applyHidden(base.openTasks, overrides?.hiddenOpenTasks ?? []),
      ...manualContext(memory, "task")
    ]),
    updatedAt: overrides?.updatedAt ?? base.updatedAt
  }
}
