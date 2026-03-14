import type { ProjectRow, ProjectStateRow, SessionDigestShape } from "@relay/shared"
import { normalizeText } from "@relay/shared"

function normalizeLine(value: string | null | undefined) {
  const next = value ? normalizeText(value) : ""
  return next || null
}

const COMMON_TOPIC_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "your",
  "have",
  "has",
  "after",
  "before",
  "make",
  "keep",
  "using",
  "use",
  "build",
  "relay",
  "project",
  "chat",
  "work",
])

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

function tokenizeComparable(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.replace(/(ing|ed|ly|es|s)$/i, ""))
    .filter((token) => token.length > 2 && !COMMON_TOPIC_STOP_WORDS.has(token))
}

function topicOverlapScore(left: string, right: string) {
  const leftTokens = tokenizeComparable(left)
  const rightTokens = tokenizeComparable(right)

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0
  }

  const rightSet = new Set(rightTokens)
  const overlap = leftTokens.filter((token) => rightSet.has(token)).length
  return overlap / Math.max(Math.min(leftTokens.length, rightTokens.length), 1)
}

function isSameTopic(left: string, right: string) {
  const normalizedLeft = normalizeText(left).toLowerCase()
  const normalizedRight = normalizeText(right).toLowerCase()

  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    return true
  }

  return topicOverlapScore(left, right) >= 0.6
}

function hasReplacementSignal(value: string) {
  return /\b(replace|replaced|instead of|rather than|switch to|migrate to|use .* instead|no longer|deprecated|supersed)\b/i.test(
    value
  )
}

function hasNegationSignal(value: string) {
  return /\b(do not|don't|dont|avoid|never|must not|cannot|can't|can not|no longer|without)\b/i.test(
    value
  )
}

function mergeGovernedList(
  existing: string[],
  incoming: string[],
  kind: "decision" | "constraint" | "task"
) {
  const next = existing.map((item) => normalizeText(item)).filter(Boolean)

  for (const candidate of incoming.map((item) => normalizeText(item)).filter(Boolean)) {
    const exactIndex = next.findIndex((item) => item.toLowerCase() === candidate.toLowerCase())
    if (exactIndex >= 0) {
      next[exactIndex] = candidate
      continue
    }

    const supersededIndex = next.findIndex((item) => {
      if (!isSameTopic(item, candidate)) {
        return false
      }

      if (kind === "task") {
        return true
      }

      return hasReplacementSignal(candidate) || hasNegationSignal(item) !== hasNegationSignal(candidate)
    })

    if (supersededIndex >= 0) {
      next[supersededIndex] = candidate
      continue
    }

    next.push(candidate)
  }

  return next
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
