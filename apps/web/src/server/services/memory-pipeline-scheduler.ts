import {
  createRepositoryBundle,
  createWorkerRepositoryProvider,
  type RepositoryBundle,
} from "@relay/db"
import {
  processItem,
  runHygieneTick,
  type MemoryPipelineRepos,
  type PipelineProviders,
  type ProcessItemResult,
} from "@relay/memory-pipeline"

import { EMBEDDING_MODEL, generateEmbedding } from "./embedding-service"
import {
  buildEntityExtractor,
  buildObservationExtractor,
  buildPipelineBudgetGate,
} from "./memory-pipeline-providers"

const DEFAULT_DRAIN_LIMIT = 2
const DEFAULT_DRAIN_MAX_MS = 2_500
const PERSONAL_STATE_DEBOUNCE_MS = 60_000
const DAILY_HYGIENE_INTERVAL_MS = 24 * 60 * 60 * 1000

export function embedCanonicalEntitiesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RELAY_EMBED_CANONICAL_ENTITIES === "true"
}

export function personalMemoryItemCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt(env.RELAY_PERSONAL_MEMORY_ITEM_CAP ?? "500", 10)
  return Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 5000) : 500
}

function createPipelineRepos(repositories: RepositoryBundle): MemoryPipelineRepos {
  return {
    provider: repositories.provider,
    memory: repositories.memory,
    observation: repositories.observations,
    entityRelation: repositories.entityRelations,
    entity: repositories.entities,
    graph: repositories.graph,
  }
}

function createPipelineProviders(): { providers: PipelineProviders; budget: ReturnType<typeof buildPipelineBudgetGate> | null; fullExtraction: boolean } {
  const fullExtraction = process.env.RELAY_MEMORY_PIPELINE_FULL === "true"
  const budget = fullExtraction ? buildPipelineBudgetGate() : null
  const providers: PipelineProviders = {
    embed: async (text: string) => ({
      vector: await generateEmbedding(text),
      model: EMBEDDING_MODEL,
    }),
    embedCanonicalEntities: embedCanonicalEntitiesEnabled(),
    ...(fullExtraction && budget
      ? {
          extractEntities: buildEntityExtractor(budget),
          extractObservations: buildObservationExtractor(budget),
        }
      : {}),
  }
  return { providers, budget, fullExtraction }
}

export async function enqueueMemoryPipelineJob(input: {
  jobType: "enrich_memory_item" | "regenerate_personal_state"
  userId?: string | null
  projectId?: string | null
  memoryItemId?: string | null
  payload?: Record<string, unknown>
  runAfter?: Date | string | null
  repositories?: RepositoryBundle
}) {
  const repositories = input.repositories ?? createRepositoryBundle(input.userId ?? undefined)
  const dedupeKey = input.jobType === "enrich_memory_item"
    ? `memory-item:${input.memoryItemId}`
    : `personal-state:${input.userId}:${input.projectId}`
  return repositories.memoryPipelineJobs.enqueue({
    jobType: input.jobType,
    dedupeKey,
    userId: input.userId ?? null,
    projectId: input.projectId ?? null,
    memoryItemId: input.memoryItemId ?? null,
    payload: input.payload ?? {},
    runAfter: input.runAfter ?? null,
  })
}

export async function enqueuePersonalStateRegeneration(
  userId: string,
  personalProjectId: string,
  repositories?: RepositoryBundle,
) {
  return enqueueMemoryPipelineJob({
    jobType: "regenerate_personal_state",
    userId,
    projectId: personalProjectId,
    payload: { userId, personalProjectId },
    runAfter: new Date(Date.now() + PERSONAL_STATE_DEBOUNCE_MS),
    repositories,
  })
}

export async function markProjectHygieneDue(
  projectId: string,
  at: Date | string = new Date(),
  repositories?: RepositoryBundle,
) {
  const repos = repositories ?? createRepositoryBundle()
  await repos.projects.markHygieneDue(projectId, at)
}

export async function drainMemoryPipelineJobs(input: {
  limit?: number
  maxMs?: number
  repositories?: RepositoryBundle
} = {}): Promise<{
  claimed: number
  completed: number
  failed: number
  results: Array<ProcessItemResult | { jobId: string; status: "done" | "failed"; error?: string }>
  flags: { fullExtraction: boolean; embedCanonicalEntities: boolean }
  budget: ReturnType<NonNullable<ReturnType<typeof buildPipelineBudgetGate>>["snapshot"]> | null
}> {
  const startedAt = Date.now()
  const repositories = input.repositories ?? createRepositoryBundle(undefined, createWorkerRepositoryProvider())
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_DRAIN_LIMIT, 1), 25)
  const maxMs = Math.min(Math.max(input.maxMs ?? DEFAULT_DRAIN_MAX_MS, 250), 60_000)
  const lockedBy = `web-${process.pid}-${Date.now()}`
  const { providers, budget, fullExtraction } = createPipelineProviders()
  const results: Array<ProcessItemResult | { jobId: string; status: "done" | "failed"; error?: string }> = []
  let claimed = 0
  let completed = 0
  let failed = 0

  while (claimed < limit && Date.now() - startedAt < maxMs) {
    const [job] = await repositories.memoryPipelineJobs.claimDue({ limit: 1, lockedBy })
    if (!job) break
    claimed += 1
    try {
      if (job.jobType === "enrich_memory_item") {
        if (!job.memoryItemId) throw new Error("enrich_memory_item job missing memory_item_id")
        const result = await processItem(createPipelineRepos(repositories), providers, job.memoryItemId)
        results.push(result)
      } else {
        const userId = job.userId ?? String(job.payload.userId ?? "")
        if (!userId) throw new Error("regenerate_personal_state job missing user_id")
        const { regeneratePersonalState } = await import("./personal-memory-service")
        await regeneratePersonalState(userId)
        results.push({ jobId: job.id, status: "done" })
      }
      await repositories.memoryPipelineJobs.complete(job.id)
      completed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await repositories.memoryPipelineJobs.fail(job.id, message)
      results.push({ jobId: job.id, status: "failed", error: message })
      failed += 1
    }
  }

  return {
    claimed,
    completed,
    failed,
    results,
    flags: {
      fullExtraction,
      embedCanonicalEntities: embedCanonicalEntitiesEnabled(),
    },
    budget: budget?.snapshot() ?? null,
  }
}

export async function drainDueProjectHygiene(input: {
  limit?: number
  maxMs?: number
  dryRun?: boolean
  repositories?: RepositoryBundle
} = {}) {
  const startedAt = Date.now()
  const repositories = input.repositories ?? createRepositoryBundle(undefined, createWorkerRepositoryProvider())
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 25)
  const maxMs = Math.min(Math.max(input.maxMs ?? 15_000, 250), 60_000)
  const projects = await repositories.projects.listDueForHygiene(limit)
  const projectIds = projects.map((project) => project.id)
  if (projectIds.length === 0) {
    return {
      projectsQueued: 0,
      projectsProcessed: 0,
      itemsProposed: 0,
      itemsCooled: 0,
      itemsArchived: 0,
      observationsCooled: 0,
      observationsArchived: 0,
      itemsResurrected: 0,
      dryRun: input.dryRun ?? false,
    }
  }

  const result = await runHygieneTick(createPipelineRepos(repositories), {
    projectIds,
    dryRun: input.dryRun ?? process.env.RELAY_HYGIENE_DRY_RUN !== "false",
  })
  const nextAt = new Date(Date.now() + DAILY_HYGIENE_INTERVAL_MS)
  if (Date.now() - startedAt < maxMs) {
    await Promise.all(projectIds.map((projectId) => repositories.projects.markHygieneCompleted(projectId, nextAt)))
  }
  return { projectsQueued: projectIds.length, ...result }
}

export async function drainTinyMemoryPipelineBatch() {
  try {
    await drainMemoryPipelineJobs({ limit: DEFAULT_DRAIN_LIMIT, maxMs: DEFAULT_DRAIN_MAX_MS })
  } catch (error) {
    console.warn("[memory-pipeline-scheduler] opportunistic drain failed:", error instanceof Error ? error.message : error)
  }
}
