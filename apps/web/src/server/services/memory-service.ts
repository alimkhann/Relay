import { createRepositoryBundle } from "@relay/db"
import { createMemoryItemSchema, updateMemoryItemSchema } from "@relay/shared"

export async function listProjectMemory(userId: string, projectId: string) {
  const repositories = createRepositoryBundle(userId)
  return repositories.memory.listByProject(projectId)
}

export async function createMemoryItem(userId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const parsed = createMemoryItemSchema.parse(input)
  const item = await repositories.memory.create(userId, parsed)
  await repositories.bootstrapPackets.clearProject(parsed.projectId)
  return item
}

export async function updateMemoryItem(userId: string, memoryId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const parsed = updateMemoryItemSchema.parse(input)
  const existing = await repositories.memory.getById(memoryId)
  const item = await repositories.memory.update(memoryId, parsed)
  await repositories.bootstrapPackets.clearProject(existing?.projectId ?? item.projectId)
  return item
}

export async function deleteMemoryItem(userId: string, memoryId: string) {
  const repositories = createRepositoryBundle(userId)
  const existing = await repositories.memory.getById(memoryId)
  await repositories.memory.remove(memoryId)
  if (existing?.projectId) {
    await repositories.bootstrapPackets.clearProject(existing.projectId)
  }
}
