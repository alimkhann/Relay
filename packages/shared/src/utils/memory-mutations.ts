import type { MemoryItemDto, ProjectDashboardDto } from "../types/project"

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

export function applyMemoryMutationToDashboard(
  dashboard: ProjectDashboardDto,
  mutation: MemoryMutationEnvelope,
): ProjectDashboardDto {
  const projectId = dashboard.project.id
  let memory = dashboard.memory

  if (
    mutation.operation === "delete" ||
    (mutation.operation === "transfer" && projectId === mutation.sourceProjectId)
  ) {
    const removedId = mutation.before?.id ?? mutation.after?.id
    if (removedId) memory = memory.filter((item) => item.id !== removedId)
  }

  const shouldInsert =
    mutation.after &&
    ((mutation.operation !== "transfer" && projectId === mutation.sourceProjectId) ||
      (mutation.operation === "transfer" && projectId === mutation.targetProjectId))

  if (shouldInsert && mutation.after) {
    memory = [mutation.after, ...memory.filter((item) => item.id !== mutation.after?.id)]
  }

  return memory === dashboard.memory ? dashboard : { ...dashboard, memory }
}
