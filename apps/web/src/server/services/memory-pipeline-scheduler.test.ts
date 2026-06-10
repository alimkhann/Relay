import { beforeEach, describe, expect, it, vi } from "vitest"

const enqueueMock = vi.fn()
const claimDueMock = vi.fn()
const completeMock = vi.fn()
const failMock = vi.fn()
const listDueForHygieneMock = vi.fn()
const markHygieneDueMock = vi.fn()
const markHygieneCompletedMock = vi.fn()
const processItemMock = vi.fn()
const runHygieneTickMock = vi.fn()

vi.mock("@relay/db", () => ({
  createRepositoryBundle: () => ({
    provider: {},
    memory: {},
    observations: {},
    entityRelations: {},
    entities: {},
    graph: {},
    memoryPipelineJobs: {
      enqueue: enqueueMock,
      claimDue: claimDueMock,
      complete: completeMock,
      fail: failMock,
    },
    projects: {
      markHygieneDue: markHygieneDueMock,
      listDueForHygiene: listDueForHygieneMock,
      markHygieneCompleted: markHygieneCompletedMock,
    },
  }),
  createWorkerRepositoryProvider: () => ({}),
}))

vi.mock("@relay/memory-pipeline", () => ({
  processItem: (...args: unknown[]) => processItemMock(...args),
  runHygieneTick: (...args: unknown[]) => runHygieneTickMock(...args),
}))

vi.mock("./embedding-service", () => ({
  EMBEDDING_MODEL: "gemini-embedding-001:rd-768",
  generateEmbedding: vi.fn(async () => [0.1]),
}))

vi.mock("./memory-pipeline-providers", () => ({
  buildEntityExtractor: vi.fn(),
  buildObservationExtractor: vi.fn(),
  buildPipelineBudgetGate: () => ({
    shouldRun: () => true,
    record: () => {},
    snapshot: () => ({ spentUsd: 0, capUsd: 5 }),
  }),
}))

import {
  drainDueProjectHygiene,
  drainMemoryPipelineJobs,
  enqueueMemoryPipelineJob,
  enqueuePersonalStateRegeneration,
} from "./memory-pipeline-scheduler"

describe("memory-pipeline-scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    enqueueMock.mockResolvedValue({ id: "job-1" })
    completeMock.mockResolvedValue(undefined)
    failMock.mockResolvedValue(undefined)
    markHygieneCompletedMock.mockResolvedValue(undefined)
    markHygieneDueMock.mockResolvedValue(undefined)
  })

  it("uses idempotent memory-item dedupe keys for enrichment jobs", async () => {
    await enqueueMemoryPipelineJob({
      jobType: "enrich_memory_item",
      userId: "user-1",
      projectId: "project-1",
      memoryItemId: "memory-1",
    })
    await enqueueMemoryPipelineJob({
      jobType: "enrich_memory_item",
      userId: "user-1",
      projectId: "project-1",
      memoryItemId: "memory-1",
    })

    expect(enqueueMock).toHaveBeenCalledTimes(2)
    expect(enqueueMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      dedupeKey: "memory-item:memory-1",
      jobType: "enrich_memory_item",
    }))
    expect(enqueueMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      dedupeKey: "memory-item:memory-1",
    }))
  })

  it("debounces personal state regeneration by user and personal project", async () => {
    await enqueuePersonalStateRegeneration("user-1", "personal-1")

    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({
      dedupeKey: "personal-state:user-1:personal-1",
      jobType: "regenerate_personal_state",
      userId: "user-1",
      projectId: "personal-1",
      runAfter: expect.any(Date),
    }))
  })

  it("claims due jobs and completes each processed memory item once", async () => {
    claimDueMock.mockResolvedValueOnce([
      {
        id: "job-1",
        jobType: "enrich_memory_item",
        memoryItemId: "memory-1",
        payload: {},
      },
    ]).mockResolvedValueOnce([])
    processItemMock.mockResolvedValue({ itemId: "memory-1", status: "done" })

    const result = await drainMemoryPipelineJobs({ limit: 5, maxMs: 5_000 })

    expect(claimDueMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }))
    expect(processItemMock).toHaveBeenCalledTimes(1)
    expect(processItemMock).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      embedCanonicalEntities: false,
    }), "memory-1")
    expect(completeMock).toHaveBeenCalledWith("job-1")
    expect(result.completed).toBe(1)
  })

  it("processes only due projects and advances their next hygiene time", async () => {
    listDueForHygieneMock.mockResolvedValue([{ id: "project-1" }, { id: "project-2" }])
    runHygieneTickMock.mockResolvedValue({
      projectsProcessed: 2,
      itemsProposed: 0,
      itemsCooled: 0,
      itemsArchived: 0,
      observationsCooled: 0,
      observationsArchived: 0,
      itemsResurrected: 0,
      dryRun: true,
    })

    const result = await drainDueProjectHygiene({ limit: 2, dryRun: true })

    expect(runHygieneTickMock).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      projectIds: ["project-1", "project-2"],
      dryRun: true,
    }))
    expect(markHygieneCompletedMock).toHaveBeenCalledTimes(2)
    expect(result.projectsQueued).toBe(2)
  })
})
