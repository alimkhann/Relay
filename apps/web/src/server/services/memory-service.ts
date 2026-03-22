import { createRepositoryBundle } from "@relay/db"
import type { CreateMemoryItemInput, MemoryItemRow } from "@relay/shared"
import { createMemoryItemSchema, updateMemoryItemSchema } from "@relay/shared"

import { embedMemoryItem, embedMemoryItems, generateEmbedding } from "./embedding-service"
import { detectRelations } from "./relation-service"

/** Fire-and-forget: generate embedding + detect relations for a new item */
async function postCreateHook(item: MemoryItemRow, repos: ReturnType<typeof createRepositoryBundle>) {
  try {
    await embedMemoryItem(item, repos)
    await detectRelations(item, repos)
  } catch (error) {
    console.error("[memory-service] post-create hook failed:", error instanceof Error ? error.message : error)
  }
}

export async function listProjectMemory(userId: string, projectId: string) {
  const repositories = createRepositoryBundle(userId)
  return repositories.memory.listByProject(projectId)
}

export async function createMemoryItem(userId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const parsed = createMemoryItemSchema.parse(input)
  const item = await repositories.memory.create(userId, parsed)
  await repositories.bootstrapPackets.clearProject(parsed.projectId)

  // Async: generate embedding + detect relations (don't block response)
  void postCreateHook(item, repositories)

  return item
}

export async function createMemoryItemBatch(userId: string, projectId: string, items: CreateMemoryItemInput[]) {
  const repositories = createRepositoryBundle(userId)
  const created = await repositories.memory.createBatch(userId, items)
  await repositories.bootstrapPackets.clearProject(projectId)

  // Async: generate embeddings for all new items
  void embedMemoryItems(created, repositories).then(async () => {
    // After embeddings, detect relations for each
    for (const item of created) {
      try {
        await detectRelations(item, repositories)
      } catch (error) {
        console.error("[memory-service] relation detection failed:", error instanceof Error ? error.message : error)
      }
    }
  }).catch((error) => {
    console.error("[memory-service] batch embedding failed:", error instanceof Error ? error.message : error)
  })

  return created
}

export async function searchMemoryItems(userId: string, projectId: string, query: string, options?: { types?: string[]; tags?: string[] }) {
  const repositories = createRepositoryBundle(userId)

  // Try hybrid search if query is provided
  try {
    const queryEmbedding = await generateEmbedding(`${query}`)
    if (queryEmbedding) {
      return repositories.memory.hybridSearch(projectId, query, queryEmbedding, options)
    }
  } catch {
    // Fall back to FTS-only search
  }

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
