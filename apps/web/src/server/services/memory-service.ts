import { createRepositoryBundle } from "@relay/db"
import { createMemoryItemSchema, updateMemoryItemSchema } from "@relay/shared"

export async function listProjectMemory(userId: string, projectId: string) {
  const repositories = createRepositoryBundle(userId)
  return repositories.memory.listByProject(projectId)
}

export async function createMemoryItem(userId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const parsed = createMemoryItemSchema.parse(input)
  return repositories.memory.create(userId, parsed)
}

export async function updateMemoryItem(userId: string, memoryId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const parsed = updateMemoryItemSchema.parse(input)
  return repositories.memory.update(memoryId, parsed)
}

export async function deleteMemoryItem(userId: string, memoryId: string) {
  const repositories = createRepositoryBundle(userId)
  await repositories.memory.remove(memoryId)
}
