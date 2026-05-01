import { createRepositoryBundle, type RepositoryBundle } from "@relay/db"
import type { CreateMemoryItemInput, MemoryEventType, MemoryItemRow } from "@relay/shared"
import { computeDecayScore, createMemoryItemSchema, DECAY_VISIBILITY_THRESHOLD, hasReplacementSignal, isSameTopic, updateMemoryItemSchema } from "@relay/shared"

import { embedMemoryItem, embedMemoryItems, generateEmbedding } from "./embedding-service"
import { extractAndLinkEntities } from "./entity-extraction-service"
import { decomposeQuery } from "./query-decomposition-service"
import { buildCurrentPreviousHint, buildReasoningEvidenceTable, buildTemporalResolutionHint } from "./reasoning-assembly-service"
import { conditionalRerank } from "./reranker-service"
import { detectRelations } from "./relation-service"

/**
 * Fire-and-forget memory event emit. Failures never propagate — events are
 * audit/analytics, not the source of truth. Null userId means "unknown actor"
 * (e.g. background job).
 */
export async function emitMemoryEvent(
  repos: RepositoryBundle,
  input: {
    projectId: string
    eventType: MemoryEventType
    memoryItemId?: string | null
    sourceSurface?: string | null
    userId?: string | null
    payload?: Record<string, unknown>
  },
): Promise<void> {
  try {
    await repos.memoryEvents.create({
      projectId: input.projectId,
      memoryItemId: input.memoryItemId ?? null,
      eventType: input.eventType,
      sourceSurface: input.sourceSurface ?? null,
      userId: input.userId ?? null,
      payload: input.payload ?? {},
    })
  } catch (error) {
    console.error("[memory-service] emitMemoryEvent failed:", error instanceof Error ? error.message : error)
  }
}

/** Fire-and-forget: generate embedding + detect relations for a new item */
async function postCreateHook(item: MemoryItemRow, repos: ReturnType<typeof createRepositoryBundle>) {
  try {
    await embedMemoryItem(item, repos)
    await detectRelations(item, repos)
    await extractAndLinkEntities(repos, item.projectId, item.id, item.content, item.title)
  } catch (error) {
    console.error("[memory-service] post-create hook failed:", error instanceof Error ? error.message : error)
  }
}

/** Generate embeddings and detect relations for a batch of items (fire-and-forget safe) */
export async function embedAndRelateItems(items: MemoryItemRow[], repos: RepositoryBundle): Promise<void> {
  if (items.length === 0) return
  try {
    await embedMemoryItems(items, repos)
    for (const item of items) {
      try {
        await detectRelations(item, repos)
      } catch (error) {
        console.error("[memory-service] relation detection failed:", error instanceof Error ? error.message : error)
      }
    }
  } catch (error) {
    console.error("[memory-service] embedAndRelateItems failed:", error instanceof Error ? error.message : error)
  }
}

export async function listProjectMemory(userId: string, projectId: string) {
  const repositories = createRepositoryBundle(userId)
  return repositories.memory.listByProject(projectId)
}

export async function createMemoryItem(userId: string, input: unknown) {
  const repositories = createRepositoryBundle(userId)
  const parsed = createMemoryItemSchema.parse(input)

  // Dedup: check for existing items with same topic
  const existing = await repositories.memory.listByProject(parsed.projectId)
  const match = existing
    .filter((m) => m.type === parsed.type && !m.isArchived)
    .find((m) => isSameTopic(m.content, parsed.content))
  if (match) {
    if (match.content.trim().toLowerCase() === parsed.content.trim().toLowerCase()) {
      return match
    }
    if (hasReplacementSignal(parsed.content)) {
      await repositories.memory.update(match.id, {
        isArchived: true,
        metadata: { ...(match.metadata ?? {}), archivedBy: "replaced" },
      })
    } else {
      parsed.metadata = { ...(parsed.metadata ?? {}), potentialDuplicate: match.id }
    }
  }

  const item = await repositories.memory.create(userId, parsed)
  await repositories.bootstrapPackets.clearProject(parsed.projectId)

  void emitMemoryEvent(repositories, {
    projectId: item.projectId,
    memoryItemId: item.id,
    eventType: "created",
    sourceSurface: item.sourceSurface,
    userId,
    payload: { type: item.type },
  })

  // Async: generate embedding + detect relations (don't block response)
  void postCreateHook(item, repositories)

  return item
}

export async function createMemoryItemBatch(userId: string, projectId: string, items: CreateMemoryItemInput[]) {
  const repositories = createRepositoryBundle(userId)
  const created = await repositories.memory.createBatch(userId, items)
  await repositories.bootstrapPackets.clearProject(projectId)

  for (const item of created) {
    void emitMemoryEvent(repositories, {
      projectId: item.projectId,
      memoryItemId: item.id,
      eventType: "created",
      sourceSurface: item.sourceSurface,
      userId,
      payload: { type: item.type, batch: true },
    })
  }

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
  const decomposition = decomposeQuery(query)

  let results: MemoryItemRow[]

  // Try hybrid search if query is provided
  try {
    const queryEmbedding = await generateEmbedding(`${query}`, "RETRIEVAL_QUERY")
    if (queryEmbedding) {
      results = await repositories.memory.hybridSearch(projectId, decomposition.normalizedQuery, queryEmbedding, {
        ...options,
        dateRange: decomposition.sourceDateRange,
        includeSuperseded: decomposition.stateIntent === "historical",
      })
    } else {
      results = await repositories.memory.search(projectId, query, options)
    }
  } catch {
    results = await repositories.memory.search(projectId, query, options)
  }

  // Filter out fully decayed items
  let memoryResults = results.filter((item) =>
    computeDecayScore(item.type, item.updatedAt, item.lastReaffirmedAt, item.pinned) >= DECAY_VISIBILITY_THRESHOLD
  )

  // Boost results containing extracted entities to the top
  if (decomposition.extractedEntities.length > 0) {
    const entityPatterns = decomposition.extractedEntities.map((e) => e.toLowerCase())
    memoryResults.sort((a, b) => {
      const aContent = (a.content + " " + (a.title ?? "")).toLowerCase()
      const bContent = (b.content + " " + (b.title ?? "")).toLowerCase()
      const aHits = entityPatterns.filter((p) => aContent.includes(p)).length
      const bHits = entityPatterns.filter((p) => bContent.includes(p)).length
      return bHits - aHits
    })
  }

  // Conditional cross-encoder rerank when top results are ambiguous
  const candidates = memoryResults.map((item) => ({
    item,
    originalScore: (item as unknown as { similarity?: number }).similarity ?? 0,
  }))
  const reranked = await conditionalRerank(query, candidates)
  if (reranked.reranked) memoryResults = reranked.items

  const canonResults = await repositories.canonEntries.searchByProject(projectId, decomposition.normalizedQuery, {
    kinds: decomposition.canonKinds.length > 0 ? decomposition.canonKinds : undefined,
    currentOnly: decomposition.stateIntent === "current",
    historicalAt: decomposition.historicalAt,
  })

  const currentPreviousHint = buildCurrentPreviousHint(canonResults)
  const evidenceTable = buildReasoningEvidenceTable({
    query: decomposition,
    canonResults,
    memoryResults,
    referenceDate: null,
  })
  const temporalHint = buildTemporalResolutionHint(evidenceTable)

  return {
    memoryResults,
    canonResults,
    queryAnalysis: decomposition,
    evidenceTable,
    currentPreviousHint,
    temporalHint,
  }
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

  const becameArchived = !existing?.isArchived && item.isArchived
  void emitMemoryEvent(repositories, {
    projectId: item.projectId,
    memoryItemId: item.id,
    eventType: becameArchived ? "archived" : "updated",
    sourceSurface: item.sourceSurface,
    userId,
    payload: {
      type: item.type,
      fieldsChanged: Object.keys(parsed),
    },
  })

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
    void emitMemoryEvent(repositories, {
      projectId: existing.projectId,
      memoryItemId: memoryId,
      eventType: "archived",
      sourceSurface: existing.sourceSurface,
      userId,
      payload: { type: existing.type, reason: "deleted" },
    })
  }
}
