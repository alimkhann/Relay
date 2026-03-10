import { createRepositoryBundle } from "@relay/db"
import { createMemoryItemSchema, updateMemoryItemSchema } from "@relay/shared"

export async function listProjectMemory(projectId: string) {
  const repositories = createRepositoryBundle()
  return repositories.memory.listByProject(projectId)
}

export async function createMemoryItem(userId: string, input: unknown) {
  const repositories = createRepositoryBundle()
  const parsed = createMemoryItemSchema.parse(input)
  return repositories.memory.create(userId, parsed)
}

export async function updateMemoryItem(memoryId: string, input: unknown) {
  const repositories = createRepositoryBundle()
  const parsed = updateMemoryItemSchema.parse(input)
  return repositories.memory.update(memoryId, parsed)
}

export async function deleteMemoryItem(memoryId: string) {
  const repositories = createRepositoryBundle()
  await repositories.memory.remove(memoryId)
}
