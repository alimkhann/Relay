import { describe, expect, it, vi } from "vitest"

import { processItem, type MemoryPipelineRepos, type PipelineProviders } from "./index"

/**
 * Minimal stateful fake of the DatabaseProvider, interpreting only the queries
 * processItem issues. Tracks enrichment_status so the atomic claim guard
 * (A21) behaves like Postgres: the first claim succeeds, later claims on an
 * already-claimed/done row return no rows.
 */
function makeProvider(initialStatus = "pending") {
  const state = { status: initialStatus, version: 0 }
  const calls: string[] = []
  const provider = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push(sql)
      if (sql.includes("SET enrichment_status = 'running'")) {
        if (state.status === "pending" || state.status === "failed") {
          state.status = "running"
          return [{ id: "m1" }]
        }
        return []
      }
      if (sql.includes("SET enrichment_status = 'done'")) {
        state.status = "done"
        const v = params?.[1]
        if (typeof v === "number") state.version = v
        return []
      }
      if (sql.includes("SET enrichment_status = 'pending'")) {
        state.status = "pending"
        return []
      }
      if (sql.includes("SET enrichment_status = 'failed'")) {
        state.status = "failed"
        return []
      }
      return []
    }),
  }
  return { provider, state, calls }
}

function makeRepos(provider: { query: ReturnType<typeof vi.fn> }): MemoryPipelineRepos {
  return {
    provider: provider as never,
    memory: {
      // embeddingModel set so processItem skips embedding in this test.
      getById: vi.fn(async () => ({
        id: "m1",
        projectId: "p1",
        spaceId: "s1",
        type: "note",
        content: "hello",
        metadata: {},
        embeddingModel: "text-embedding-004",
      })),
    } as never,
    observation: {} as never,
    entityRelation: {} as never,
    entity: {} as never,
    graph: {} as never,
    space: {} as never,
  }
}

const providers: PipelineProviders = {
  // Embed-only mode (Track A): no extractors wired.
  embed: vi.fn(async () => ({ vector: [0.1, 0.2], model: "text-embedding-004" })),
}

describe("processItem", () => {
  it("embed-only run reverts status to 'pending' (no version bump) so FULL ticks reclaim it", async () => {
    // Track A: extractors not wired. Embed-only must not lock the row at
    // version=2/done — otherwise migration 0049's flipped rows get
    // permanently excluded from v2 extraction once FULL=true flips on.
    const { provider, state } = makeProvider("pending")
    const repos = makeRepos(provider)

    const result = await processItem(repos, providers, "m1")

    expect(result.status).toBe("done")
    expect(state.status).toBe("pending")
    expect(state.version).toBe(0)
  })

  it("FULL extraction marks the row done at PIPELINE_VERSION", async () => {
    const { provider, state } = makeProvider("pending")
    const repos = makeRepos(provider)
    repos.entity = {
      findOrCreateBySpace: vi.fn(async (_s: string, name: string) => ({ id: `e-${name}` })),
      addMention: vi.fn(async () => ({})),
    } as never
    repos.entityRelation = {
      invalidateCurrentForSubjectPredicate: vi.fn(async () => 0),
      upsertCurrent: vi.fn(async () => ({ id: "rel1" })),
    } as never
    repos.observation = {
      findCurrentSvo: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "obs1" })),
      updateEmbedding: vi.fn(async () => undefined),
      invalidate: vi.fn(async () => undefined),
    } as never

    const richProviders: PipelineProviders = {
      embed: vi.fn(async () => ({ vector: [0.1], model: "text-embedding-004" })),
      extractEntities: vi.fn(async () => []),
      extractObservations: vi.fn(async () => []),
    }

    const result = await processItem(repos, richProviders, "m1")

    expect(result.status).toBe("done")
    expect(state.status).toBe("done")
    expect(state.version).toBe(2)
  })

  it("skips a row that is already done (idempotent re-run)", async () => {
    const { provider } = makeProvider("done")
    const repos = makeRepos(provider)

    const result = await processItem(repos, providers, "m1")

    expect(result.status).toBe("skipped")
    expect(result.error).toMatch(/already claimed/i)
  })

  it("returns skipped when the item no longer exists", async () => {
    const { provider } = makeProvider("pending")
    const repos = makeRepos(provider)
    ;(repos.memory.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)

    const result = await processItem(repos, providers, "missing")

    expect(result.status).toBe("skipped")
    expect(result.error).toMatch(/not found/i)
  })

  it("embeds canonical_entities on insert when extractor finds a new entity (F4)", async () => {
    const { provider } = makeProvider("pending")
    const repos = makeRepos(provider)
    ;(repos.memory.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "m1",
      projectId: "p1",
      spaceId: "s1",
      type: "note",
      content: "Alim uses Postgres",
      metadata: {},
      embeddingModel: "gemini-embedding-001:rd-768",
    })
    const updateEmbedding = vi.fn(async () => undefined)
    repos.entity = {
      // Freshly created → hasEmbedding=false.
      findOrCreateBySpace: vi.fn(async (_s: string, name: string, kind: string) => ({
        id: `e-${name}`,
        name,
        kind,
        hasEmbedding: false,
      })),
      addMention: vi.fn(async () => ({})),
      updateEmbedding,
    } as never
    repos.entityRelation = {
      invalidateCurrentForSubjectPredicate: vi.fn(async () => 0),
      upsertCurrent: vi.fn(async () => ({ id: "rel1" })),
    } as never
    repos.observation = {
      findCurrentSvo: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "obs1" })),
      updateEmbedding: vi.fn(async () => undefined),
      invalidate: vi.fn(async () => undefined),
    } as never

    const embedded: string[] = []
    const richProviders: PipelineProviders = {
      embed: vi.fn(async (text: string) => {
        embedded.push(text)
        return { vector: [0.1], model: "gemini-embedding-001:rd-768" }
      }),
      extractEntities: vi.fn(async () => [
        { name: "Postgres", kind: "technology", mentionText: "Postgres" },
      ]),
      extractObservations: vi.fn(async () => []),
    }

    const result = await processItem(repos, richProviders, "m1")

    expect(result.status).toBe("done")
    expect(updateEmbedding).toHaveBeenCalledTimes(1)
    expect(updateEmbedding).toHaveBeenCalledWith("e-Postgres", [0.1])
    expect(embedded).toContain("Postgres (technology)")
  })

  it("skips canonical_entities embed when the row already has an embedding (F4)", async () => {
    const { provider } = makeProvider("pending")
    const repos = makeRepos(provider)
    ;(repos.memory.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "m1",
      projectId: "p1",
      spaceId: "s1",
      type: "note",
      content: "Alim uses Postgres",
      metadata: {},
      embeddingModel: "gemini-embedding-001:rd-768",
    })
    const updateEmbedding = vi.fn(async () => undefined)
    repos.entity = {
      findOrCreateBySpace: vi.fn(async (_s: string, name: string) => ({
        id: `e-${name}`,
        name,
        kind: "technology",
        hasEmbedding: true, // already embedded; worker must not re-embed
      })),
      addMention: vi.fn(async () => ({})),
      updateEmbedding,
    } as never
    repos.entityRelation = {
      invalidateCurrentForSubjectPredicate: vi.fn(async () => 0),
      upsertCurrent: vi.fn(async () => ({ id: "rel1" })),
    } as never
    repos.observation = {
      findCurrentSvo: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "obs1" })),
      updateEmbedding: vi.fn(async () => undefined),
      invalidate: vi.fn(async () => undefined),
    } as never

    const richProviders: PipelineProviders = {
      embed: vi.fn(async () => ({ vector: [0.1], model: "gemini-embedding-001:rd-768" })),
      extractEntities: vi.fn(async () => [{ name: "Postgres", mentionText: "Postgres" }]),
      extractObservations: vi.fn(async () => []),
    }

    await processItem(repos, richProviders, "m1")
    expect(updateEmbedding).not.toHaveBeenCalled()
  })

  it("supersedes a stale entity_relation when an SVO's object changes (B3)", async () => {
    const { provider } = makeProvider("pending")
    const repos = makeRepos(provider)
    ;(repos.memory.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "m1",
      projectId: "p1",
      spaceId: "s1",
      type: "note",
      content: "Alim now uses Postgres",
      metadata: {},
      embeddingModel: "text-embedding-004",
    })
    repos.entity = {
      findOrCreateBySpace: vi.fn(async (_space: string, name: string) => ({
        id: name === "Alim" ? "e-alim" : "e-postgres",
      })),
      addMention: vi.fn(async () => ({})),
    } as never
    const invalidateCurrentForSubjectPredicate = vi.fn(async () => 1)
    const upsertCurrent = vi.fn(async () => ({ id: "rel1" }))
    repos.entityRelation = { invalidateCurrentForSubjectPredicate, upsertCurrent } as never
    repos.observation = {
      // Prior SVO points at a different object (e-mysql) → conflict.
      findCurrentSvo: vi.fn(async () => ({ id: "obs-old", objectEntityId: "e-mysql", objectLiteral: null })),
      create: vi.fn(async () => ({ id: "obs-new" })),
      updateEmbedding: vi.fn(async () => undefined),
      invalidate: vi.fn(async () => undefined),
    } as never

    const richProviders: PipelineProviders = {
      embed: vi.fn(async () => ({ vector: [0.1], model: "text-embedding-004" })),
      extractEntities: vi.fn(async () => [
        { name: "Alim", mentionText: "Alim" },
        { name: "Postgres", mentionText: "Postgres" },
      ]),
      extractObservations: vi.fn(async () => [
        { content: "Alim uses Postgres", subjectName: "Alim", predicate: "uses", objectName: "Postgres" },
      ]),
    }

    const result = await processItem(repos, richProviders, "m1")

    expect(result.status).toBe("done")
    expect(invalidateCurrentForSubjectPredicate).toHaveBeenCalledWith("s1", "e-alim", "uses", "e-postgres")
    expect(upsertCurrent).toHaveBeenCalled()
    expect(result.relationsCreated).toBe(1)
  })
})
