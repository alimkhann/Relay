import type { AssistantActionItem, AssistantActionResult } from "../types/assistant"
import type { MemoryItemDto, ProjectDashboardDto } from "../types/project"
import type { MemoryItemType } from "../types/database"
import { normalizeText } from "./text"

export type MemoryMutationOperation = "create" | "update" | "delete" | "transfer"
export type MemoryMutationStatus = "optimistic" | "succeeded" | "failed"

export interface MemoryMutationEnvelope {
  operation: MemoryMutationOperation
  status: MemoryMutationStatus
  sourceProjectId: string
  targetProjectId?: string
  before?: MemoryItemDto
  after?: MemoryItemDto
  error?: string
}

const MEMORY_MUTATION_TOOLS = new Set(["add_memory", "manage_memory", "personal_memory_autowrite"])

function isMemoryItemType(value: string | undefined): value is MemoryItemType {
  return (
    value === "decision" ||
    value === "constraint" ||
    value === "task" ||
    value === "note" ||
    value === "requirement" ||
    value === "artifact" ||
    value === "checkpoint" ||
    value === "reference" ||
    value === "state"
  )
}

function actionItemToMemoryDto(
  item: AssistantActionItem,
  fallbackProjectId?: string | null,
): MemoryItemDto | undefined {
  const id = item.id?.trim()
  const content = item.content?.trim() || item.label?.trim()
  if (!id || !content) return undefined
  const type = isMemoryItemType(item.type) ? item.type : "note"
  const now = new Date().toISOString()
  return {
    id,
    type,
    title: item.title ?? null,
    content,
    pinned: false,
    updatedAt: now,
    metadata: item.personalCategory ? { personalCategory: item.personalCategory } : undefined,
    sourceSurface: "ask_relay",
    sourceUrl: null,
    capturedAt: now,
    decayScore: 1,
    lastReaffirmedAt: null,
  }
}

export function actionResultToMemoryMutations(
  result: AssistantActionResult,
  fallbackProjectId?: string | null,
): MemoryMutationEnvelope[] {
  if (!MEMORY_MUTATION_TOOLS.has(result.tool)) return []

  const mutations: MemoryMutationEnvelope[] = []
  const previews = result.previews ?? []

  if (result.action === "created") {
    for (const preview of previews.length > 0 ? previews : result.items.map((after) => ({ after }))) {
      const after = preview.after ? actionItemToMemoryDto(preview.after, fallbackProjectId) : undefined
      const projectId = preview.after?.projectId ?? fallbackProjectId
      if (!after || !projectId) continue
      mutations.push({
        operation: "create",
        status: "succeeded",
        sourceProjectId: projectId,
        after,
      })
    }
    return mutations
  }

  if (result.action === "deleted") {
    for (const preview of previews.length > 0 ? previews : result.items.map((before) => ({ before }))) {
      const before = preview.before ? actionItemToMemoryDto(preview.before, fallbackProjectId) : undefined
      const projectId = preview.before?.projectId ?? fallbackProjectId
      if (!before || !projectId) continue
      mutations.push({
        operation: "delete",
        status: "succeeded",
        sourceProjectId: projectId,
        before,
      })
    }
    return mutations
  }

  if (result.action === "updated") {
    for (const preview of previews) {
      const before = preview.before ? actionItemToMemoryDto(preview.before, fallbackProjectId) : undefined
      const after = preview.after ? actionItemToMemoryDto(preview.after, fallbackProjectId) : undefined
      const sourceProjectId = preview.before?.projectId ?? fallbackProjectId
      const targetProjectId = preview.after?.projectId
      if (!before || !after || !sourceProjectId) continue
      if (targetProjectId && targetProjectId !== sourceProjectId) {
        mutations.push({
          operation: "transfer",
          status: "succeeded",
          sourceProjectId,
          targetProjectId,
          before,
          after,
        })
      } else {
        mutations.push({
          operation: "update",
          status: "succeeded",
          sourceProjectId,
          before,
          after,
        })
      }
    }
  }

  return mutations
}

function governedStateKey(
  type: MemoryItemDto["type"],
): "decisions" | "constraints" | "openTasks" | null {
  if (type === "decision") return "decisions"
  if (type === "constraint") return "constraints"
  if (type === "task") return "openTasks"
  return null
}

function replaceGovernedStateLine(
  lines: string[] | undefined,
  beforeText: string,
  afterText: string,
): string[] | undefined {
  if (!lines) return lines
  const beforeNorm = normalizeText(beforeText).toLowerCase()
  let changed = false
  const next = lines.map((line) => {
    if (normalizeText(line).toLowerCase() === beforeNorm) {
      changed = true
      return afterText
    }
    return line
  })
  return changed ? next : lines
}

function removeGovernedStateLine(
  lines: string[] | undefined,
  text: string,
): string[] | undefined {
  if (!lines) return lines
  const targetNorm = normalizeText(text).toLowerCase()
  const next = lines.filter((line) => normalizeText(line).toLowerCase() !== targetNorm)
  return next.length === lines.length ? lines : next
}

export function applyMemoryMutationToDashboard(
  dashboard: ProjectDashboardDto,
  mutation: MemoryMutationEnvelope,
): ProjectDashboardDto {
  const projectId = dashboard.project.id
  let memory = dashboard.memory
  let projectState = dashboard.projectState

  if (
    mutation.operation === "delete" ||
    (mutation.operation === "transfer" && projectId === mutation.sourceProjectId)
  ) {
    const removedId = mutation.before?.id ?? mutation.after?.id
    if (removedId) memory = memory.filter((item) => item.id !== removedId)
    if (mutation.before && projectState) {
      const stateKey = governedStateKey(mutation.before.type)
      if (stateKey) {
        const nextLines = removeGovernedStateLine(projectState[stateKey], mutation.before.content)
        if (nextLines !== projectState[stateKey]) {
          projectState = { ...projectState, [stateKey]: nextLines }
        }
      }
    }
  }

  const shouldInsert =
    mutation.after &&
    ((mutation.operation !== "transfer" && projectId === mutation.sourceProjectId) ||
      (mutation.operation === "transfer" && projectId === mutation.targetProjectId))

  if (shouldInsert && mutation.after) {
    const after = mutation.after
    const afterNorm = normalizeText(after.content).toLowerCase()
    memory = [
      after,
      ...memory.filter((item) => {
        if (item.id === after.id) return false
        if (
          mutation.operation === "create" &&
          item.id.startsWith("optimistic-") &&
          item.type === after.type &&
          normalizeText(item.content).toLowerCase() === afterNorm
        ) {
          return false
        }
        return true
      }),
    ]
    if (projectState) {
      const stateKey = governedStateKey(after.type)
      if (stateKey) {
        if (mutation.operation === "update" && mutation.before) {
          const nextLines = replaceGovernedStateLine(
            projectState[stateKey],
            mutation.before.content,
            after.content,
          )
          if (nextLines !== projectState[stateKey]) {
            projectState = { ...projectState, [stateKey]: nextLines }
          }
        } else if (mutation.operation === "create") {
          const lines = projectState[stateKey] ?? []
          const afterNorm = normalizeText(after.content).toLowerCase()
          if (!lines.some((line) => normalizeText(line).toLowerCase() === afterNorm)) {
            projectState = { ...projectState, [stateKey]: [after.content, ...lines] }
          }
        }
      }
    }
  }

  if (memory === dashboard.memory && projectState === dashboard.projectState) {
    return dashboard
  }
  return { ...dashboard, memory, projectState }
}
