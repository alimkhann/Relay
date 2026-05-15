import { createRepositoryBundle } from "@relay/db"

type McpProjectStateInput = {
  projectOverview?: string
  currentObjective?: string
  recentProgress?: string
  stackDomain?: string
  decisions?: string[]
  constraints?: string[]
  openTasks?: string[]
  relevantTools?: string[]
  replaceLists?: boolean
}

const MAX_LIST_ITEMS = 24

function normalizeTextInput(value: string | undefined, fallback: string | null) {
  if (value === undefined) return fallback
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeTimestampInput(value: Date | string | null | undefined) {
  if (!value) return null
  if (value instanceof Date) {
    return value.toISOString()
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function mergeUnique(existing: string[], incoming: string[] | undefined, replaceLists: boolean) {
  if (!incoming) {
    return existing
  }

  const base = replaceLists ? [] : existing
  const seen = new Set(base.map((item) => item.toLowerCase()))
  const next = [...base]

  for (const value of incoming) {
    const normalized = value.trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(normalized)
    if (next.length >= MAX_LIST_ITEMS) break
  }

  return next
}

export async function upsertProjectStateFromMcp(userId: string, projectId: string, input: McpProjectStateInput) {
  const repositories = createRepositoryBundle(userId)
  const [project, currentState] = await Promise.all([
    repositories.projects.getById(projectId),
    repositories.projectState.getByProject(projectId),
  ])

  if (!project) {
    throw new Error("Project not found.")
  }

  const replaceLists = input.replaceLists ?? false

  const nextState = await repositories.projectState.upsert({
    projectId,
    projectOverview: normalizeTextInput(
      input.projectOverview,
      currentState?.projectOverview ?? project.description ?? null,
    ),
    currentObjective: normalizeTextInput(input.currentObjective, currentState?.currentObjective ?? null),
    recentProgress: normalizeTextInput(input.recentProgress, currentState?.recentProgress ?? null),
    stackDomain: normalizeTextInput(input.stackDomain, currentState?.stackDomain ?? null),
    decisions: mergeUnique(currentState?.decisions ?? [], input.decisions, replaceLists),
    constraints: mergeUnique(currentState?.constraints ?? [], input.constraints, replaceLists),
    openTasks: mergeUnique(currentState?.openTasks ?? [], input.openTasks, replaceLists),
    relevantTools: mergeUnique(currentState?.relevantTools ?? [], input.relevantTools, replaceLists),
    objectiveHistory: currentState?.objectiveHistory ?? [],
    dirty: false,
    lastBootstrapAt: normalizeTimestampInput(currentState?.lastBootstrapAt),
  })

  return nextState
}
