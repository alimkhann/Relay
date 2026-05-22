import { createRepositoryBundle, type RepositoryBundle } from "@relay/db"
import type { CreateMemoryItemInput, MemoryEventType, MemoryItemRow } from "@relay/shared"
import { computeDecayScore, createMemoryItemSchema, DECAY_VISIBILITY_THRESHOLD, updateMemoryItemSchema } from "@relay/shared"

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

/** Generate embeddings, detect relations, and extract entities for a batch of items (fire-and-forget safe) */
export async function embedAndRelateItems(items: MemoryItemRow[], repos: RepositoryBundle): Promise<void> {
  if (items.length === 0) return
  try {
    await embedMemoryItems(items, repos)
    for (const item of items) {
      try {
        await detectRelations(item, repos)
        await extractAndLinkEntities(repos, item.projectId, item.id, item.content, item.title)
      } catch (error) {
        console.error("[memory-service] post-batch enrichment failed:", error instanceof Error ? error.message : error)
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

  // Memory v2: dedup is async. The synchronous in-memory dedup scan (which
  // pulled every active item via listByProject and walked them with
  // isSameTopic) lived here previously. It made capture latency O(project
  // size) and blocked the extension + MCP write path. The memory-pipeline
  // worker now handles dedup via resolveMemoryConflict + bi-temporal
  // supersession (closes loser's valid_until, moves it to 'cooling') after
  // the row lands.
  //
  // The web write path remains fast and stateless: insert row, emit event,
  // kick off the legacy postCreateHook for back-compat embeddings, return.
  // The worker tick reconciles afterwards. Reads tolerate this because the
  // default lifecycle_state is 'active' and recall filters cooling out of
  // the top channels.

  const item = await repositories.memory.create(userId, parsed)
  if (parsed.projectId) {
    await repositories.projectState.markDirty(parsed.projectId)
  }

  if (item.projectId) {
    void emitMemoryEvent(repositories, {
      projectId: item.projectId,
      memoryItemId: item.id,
      eventType: "created",
      sourceSurface: item.sourceSurface,
      userId,
      payload: { type: item.type },
    })
  }

  // Async: generate embedding + detect relations (don't block response).
  // The new memory-pipeline worker eventually supersedes this hook; until
  // the worker is deployed, keep the inline best-effort enrichment so
  // dashboards don't see empty embedding columns for a tick or two.
  void postCreateHook(item, repositories)

  return item
}

export async function createMemoryItemBatch(userId: string, projectId: string, items: CreateMemoryItemInput[]) {
  const repositories = createRepositoryBundle(userId)
  const created = await repositories.memory.createBatch(userId, items)

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

  // Async: generate embeddings, detect relations, extract entities for all new items
  void embedMemoryItems(created, repositories).then(async () => {
    for (const item of created) {
      try {
        await detectRelations(item, repositories)
        await extractAndLinkEntities(repositories, item.projectId, item.id, item.content, item.title)
      } catch (error) {
        console.error("[memory-service] post-batch enrichment failed:", error instanceof Error ? error.message : error)
      }
    }
  }).catch((error) => {
    console.error("[memory-service] batch embedding failed:", error instanceof Error ? error.message : error)
  })

  return created
}

export async function searchMemoryItems(
  userId: string,
  projectId: string,
  query: string,
  options?: {
    types?: string[]
    tags?: string[]
    /** Memory v2: scope by space (personal or project) instead of project_id. */
    spaceId?: string
    /** Memory v2: explicit lifecycle filter. Defaults to active+cooling; 'forgotten' never returned. */
    lifecycleStates?: string[]
    /** Memory v2: include archived items in results (presented as distinct). */
    includeArchived?: boolean
  },
) {
  const repositories = createRepositoryBundle(userId)
  const decomposition = decomposeQuery(query)
  const scope = {
    spaceId: options?.spaceId,
    lifecycleStates: options?.lifecycleStates,
    includeArchived: options?.includeArchived,
  }
  // When the caller broadens the lifecycle set (archived/explicit states), don't
  // also crush archived rows with the decay-visibility floor — they were asked for.
  const lifecycleBroadened = Boolean(options?.includeArchived || options?.lifecycleStates?.length)

  let results: MemoryItemRow[]
  let hasSimilarityScores = false

  // Try hybrid search if query is provided
  try {
    const queryEmbedding = await generateEmbedding(`${query}`, "RETRIEVAL_QUERY")
    if (queryEmbedding) {
      results = await repositories.memory.hybridSearch(projectId, decomposition.normalizedQuery, queryEmbedding, {
        ...options,
        ...scope,
        dateRange: decomposition.sourceDateRange,
        includeSuperseded: decomposition.stateIntent === "historical",
      })
      hasSimilarityScores = true
    } else {
      results = await repositories.memory.search(projectId, query, { ...options, ...scope })
    }
  } catch {
    results = await repositories.memory.search(projectId, query, { ...options, ...scope })
  }

  // Filter out fully decayed items (skipped when the caller explicitly broadened
  // the lifecycle set so archived items stay visible).
  let memoryResults = lifecycleBroadened
    ? results
    : results.filter((item) =>
        computeDecayScore(item.type, item.updatedAt, item.lastReaffirmedAt, item.pinned) >= DECAY_VISIBILITY_THRESHOLD
      )

  // Conditional cross-encoder rerank when top results are ambiguous.
  // Built BEFORE entity boost so candidates[0] is the highest-similarity hit.
  // Skipped entirely when no similarity scores are available (fallback search path).
  if (hasSimilarityScores && memoryResults.length >= 2) {
    const candidates = memoryResults.map((item) => ({
      item,
      originalScore: (item as unknown as { similarity?: number }).similarity ?? null,
    }))
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 1500)
    try {
      const reranked = await conditionalRerank(query, candidates, { signal: ac.signal })
      if (reranked.reranked) memoryResults = reranked.items
    } finally {
      clearTimeout(timer)
    }
  }

  // Boost results containing extracted entities to the top (after rerank)
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

  // Canon entries are project-scoped; skip them for personal/space-scoped recall.
  const canonResults = options?.spaceId
    ? []
    : await repositories.canonEntries.searchByProject(projectId, decomposition.normalizedQuery, {
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

/**
 * Memory v2: space-scoped auxiliary context — observations + entity graph
 * snapshot. Powers `recall include:[observations,entities]`. Reuses the
 * observation hybrid search + graph snapshot already built in the db package.
 */
export async function getSpaceContext(
  userId: string,
  spaceId: string,
  options: {
    query?: string
    includeObservations?: boolean
    includeEntities?: boolean
    lifecycleStates?: string[]
    includeArchived?: boolean
    limit?: number
  },
) {
  const repositories = createRepositoryBundle(userId)
  const limit = options.limit ?? 20
  const lifecycleStates = (
    options.lifecycleStates?.length
      ? options.lifecycleStates
      : options.includeArchived
        ? ["active", "cooling", "archived"]
        : ["active", "cooling"]
  ).filter((s) => s !== "forgotten") as Array<"active" | "cooling" | "archived">

  let observations: unknown[] = []
  if (options.includeObservations) {
    if (options.query) {
      let embedding: number[] | null = null
      try {
        embedding = await generateEmbedding(options.query, "RETRIEVAL_QUERY")
      } catch {
        embedding = null
      }
      observations = await repositories.observations.hybridSearch(spaceId, embedding, options.query, {
        limit,
        lifecycleStates,
      })
    } else {
      observations = await repositories.observations.listBySpace(spaceId, { lifecycleStates, limit })
    }
  }

  const entities = options.includeEntities
    ? await repositories.graph.getSpaceGraphSnapshot(spaceId, limit)
    : null

  return { observations, entities }
}

export async function updateMemoryItem(userId: string, memoryId: string, input: unknown, projectId?: string) {
  const repositories = createRepositoryBundle(userId)
  const parsed = updateMemoryItemSchema.parse(input)
  const existing = await repositories.memory.getById(memoryId)
  if (projectId && existing?.projectId && existing.projectId !== projectId) {
    throw new Error("This MCP token cannot update memory from another project.")
  }

  const lifecycleState = parsed.lifecycleState ?? null
  const isForgetting = lifecycleState === "forgotten"
  if (isForgetting && !parsed.confirm) {
    throw new Error("Forgetting a memory requires confirm:true.")
  }

  // One atomic UPDATE. The repo handles every column (legacy + v2 lifecycle)
  // in a single statement, so a partial patch can't leave content and the
  // event log disagreeing. The trigger from migration 0041 keeps is_archived
  // in sync with lifecycle_state. `confirm` is control-only — not persisted.
  const { confirm: _confirm, ...patch } = parsed
  const item = await repositories.memory.update(memoryId, {
    ...patch,
    nullContent: isForgetting,
  })

  await repositories.projectState.markDirty(existing?.projectId ?? item.projectId)

  // Emit one event for the lifecycle transition (if any) AND a separate
  // `reaffirmed` event when the decay clock was reset — the two signals are
  // independent and a single-pick ladder would silently drop one.
  let lifecycleEvent: MemoryEventType | null = null
  const becameArchived = !existing?.isArchived && item.isArchived
  if (lifecycleState === "archived") lifecycleEvent = "archived"
  else if (lifecycleState === "active" && existing?.isArchived) lifecycleEvent = "restored"
  else if (lifecycleState === "forgotten") lifecycleEvent = "forgotten"
  else if (lifecycleState === "cooling") lifecycleEvent = "cooled"
  else if (becameArchived) lifecycleEvent = "archived"

  const reaffirmed = parsed.lastReaffirmedAt !== undefined
  const fieldsChanged = Object.keys(parsed)

  if (lifecycleEvent) {
    void emitMemoryEvent(repositories, {
      projectId: item.projectId,
      memoryItemId: item.id,
      eventType: lifecycleEvent,
      sourceSurface: item.sourceSurface,
      userId,
      payload: { type: item.type, fieldsChanged, lifecycleState: lifecycleState ?? null },
    })
  }
  if (reaffirmed) {
    void emitMemoryEvent(repositories, {
      projectId: item.projectId,
      memoryItemId: item.id,
      eventType: "reaffirmed",
      sourceSurface: item.sourceSurface,
      userId,
      payload: { type: item.type, fieldsChanged },
    })
  }
  if (!lifecycleEvent && !reaffirmed) {
    void emitMemoryEvent(repositories, {
      projectId: item.projectId,
      memoryItemId: item.id,
      eventType: "updated",
      sourceSurface: item.sourceSurface,
      userId,
      payload: { type: item.type, fieldsChanged },
    })
  }

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
    await repositories.projectState.markDirty(existing.projectId)
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
