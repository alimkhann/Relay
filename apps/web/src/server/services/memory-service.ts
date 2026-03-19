import { createRepositoryBundle } from "@relay/db"
import type { CreateMemoryItemInput } from "@relay/shared"
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

export async function createMemoryItemBatch(userId: string, projectId: string, items: CreateMemoryItemInput[]) {
  const repositories = createRepositoryBundle(userId)
  const created = await repositories.memory.createBatch(userId, items)
  await repositories.bootstrapPackets.clearProject(projectId)
  return created
}

export async function searchMemoryItems(userId: string, projectId: string, query: string, options?: { types?: string[]; tags?: string[] }) {
  const repositories = createRepositoryBundle(userId)
  return repositories.memory.search(projectId, query, options)
}

export async function updateMemoryItem(userId: string, memoryId: string, input: unknown, projectId?: string) {
  const repositories = createRepositoryBundle(userId)
  const parsed = updateMemoryItemSchema.parse(input)
  const existing = await repositories.memory.getById(memoryId)
  if (projectId && existing?.projectId && existing.projectId !== projectId) {
    throw new Error("This MCP token cannot update memory from another project.")
  }
  const item = await repositories.memory.update(memoryId, parsed)
  await repositories.bootstrapPackets.clearProject(existing?.projectId ?? item.projectId)
  return item
}

export async function deleteMemoryItem(userId: string, memoryId: string, projectId?: string) {
  const repositories = createRepositoryBundle(userId)
  const existing = await repositories.memory.getById(memoryId)
  if (projectId && existing?.projectId && existing.projectId !== projectId) {
    throw new Error("This MCP token cannot delete memory from another project.")
  }
  await repositories.memory.remove(memoryId)
  if (existing?.projectId) {
    await repositories.bootstrapPackets.clearProject(existing.projectId)
  }
}
