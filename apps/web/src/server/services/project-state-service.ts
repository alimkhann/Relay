import type { ProjectRow, ProjectStateRow, SessionDigestShape } from "@relay/shared"
import { mergeGovernedList, normalizeText, stripArrowNotation } from "@relay/shared"

function normalizeLine(value: string | null | undefined) {
  const next = value ? normalizeText(value) : ""
  if (!next) return null
  return stripArrowNotation(next)
}

function mergeUnique(existing: string[], incoming: string[]) {
  const seen = new Set(existing.map((item) => item.toLowerCase()))
  const merged = [...existing]

  for (const item of incoming.map((entry) => normalizeText(entry)).filter(Boolean)) {
    const key = item.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(item)
    }
  }

  return merged
}

export function buildInitialProjectState(project: ProjectRow, current: ProjectStateRow | null): ProjectStateRow {
  if (current) {
    return current
  }

  return {
    projectId: project.id,
    projectOverview: normalizeLine(project.description),
    currentObjective: null,
    stackDomain: null,
    recentProgress: null,
    decisions: [],
    constraints: [],
    openTasks: [],
    relevantTools: [],
    lastBootstrapAt: null,
    dirty: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

export function mergeDigestIntoState(project: ProjectRow, current: ProjectStateRow | null, digest: SessionDigestShape): ProjectStateRow {
  const base = buildInitialProjectState(project, current)

  const next: ProjectStateRow = {
    ...base,
    projectOverview: normalizeLine(digest.projectOverviewDelta) ?? base.projectOverview,
    currentObjective: normalizeLine(digest.currentObjectiveDelta) ?? base.currentObjective,
    stackDomain: base.stackDomain,
    recentProgress: normalizeLine(digest.recentProgressDelta) ?? base.recentProgress,
    decisions: mergeGovernedList(base.decisions, digest.newDecisions, "decision"),
    constraints: mergeGovernedList(base.constraints, digest.newConstraints, "constraint"),
    openTasks: mergeGovernedList(base.openTasks, digest.newTasks, "task"),
    relevantTools: mergeUnique(base.relevantTools, digest.relevantToolsDelta),
    dirty: digest.shouldMerge || base.dirty,
    createdAt: base.createdAt,
    updatedAt: new Date().toISOString()
  }

  const changed =
    next.projectOverview !== base.projectOverview ||
    next.currentObjective !== base.currentObjective ||
    next.recentProgress !== base.recentProgress ||
    JSON.stringify(next.decisions) !== JSON.stringify(base.decisions) ||
    JSON.stringify(next.constraints) !== JSON.stringify(base.constraints) ||
    JSON.stringify(next.openTasks) !== JSON.stringify(base.openTasks) ||
    JSON.stringify(next.relevantTools) !== JSON.stringify(base.relevantTools)

  return {
    ...next,
    dirty: changed || base.dirty
  }
}
