import { beforeEach, describe, expect, it, vi } from "vitest"

const providerQueryMock = vi.fn()
const backfillMissingEmbeddingsMock = vi.fn()
const backfillStaleEmbeddingsMock = vi.fn()
const generateEmbeddingMock = vi.fn()

vi.mock("@relay/db", () => ({
  createRepositoryBundle: () => ({
    provider: { query: providerQueryMock },
    memory: {
      getItemsWithoutEmbeddings: vi.fn().mockResolvedValue([]),
      getItemsWithStaleEmbeddingModel: vi.fn().mockResolvedValue([]),
    },
  }),
  createWorkerRepositoryBundle: () => ({
    provider: { query: providerQueryMock },
    memory: {
      getItemsWithoutEmbeddings: vi.fn().mockResolvedValue([]),
      getItemsWithStaleEmbeddingModel: vi.fn().mockResolvedValue([]),
    },
  }),
}))

vi.mock("@/server/services/embedding-service", () => ({
  EMBEDDING_MODEL: "gemini-embedding-001:rd-768",
  backfillMissingEmbeddings: (...args: unknown[]) => backfillMissingEmbeddingsMock(...args),
  backfillStaleEmbeddings: (...args: unknown[]) => backfillStaleEmbeddingsMock(...args),
  generateEmbedding: (...args: unknown[]) => generateEmbeddingMock(...args),
}))

import { POST } from "./route"

describe("POST /api/cron/embedding-backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("CRON_SECRET", "secret")
    backfillMissingEmbeddingsMock.mockResolvedValue(0)
    backfillStaleEmbeddingsMock.mockResolvedValue(0)
    generateEmbeddingMock.mockResolvedValue([0.1])
    providerQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM observations") && sql.includes("SELECT id")) return []
      if (sql.includes("FROM source_chunks") && sql.includes("SELECT id")) return []
      if (sql.includes("COUNT(*)::int AS remaining")) return [{ remaining: 0 }]
      return []
    })
  })

  it("excludes canonical_entities from table=all unless explicitly opted in", async () => {
    const response = await POST(new Request("http://relay.test/api/cron/embedding-backfill?table=all&limit=10", {
      method: "POST",
      headers: { authorization: "Bearer secret" },
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(Object.keys(body.tables).sort()).toEqual(["memory_items", "observations", "source_chunks"])
    expect(providerQueryMock.mock.calls.some(([sql]) => String(sql).includes("FROM canonical_entities"))).toBe(false)
  })

  it("includes canonical_entities only with includeCanonicalEntities=true", async () => {
    const response = await POST(new Request("http://relay.test/api/cron/embedding-backfill?table=all&includeCanonicalEntities=true&limit=10", {
      method: "POST",
      headers: { authorization: "Bearer secret" },
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(Object.keys(body.tables).sort()).toEqual(["canonical_entities", "memory_items", "observations", "source_chunks"])
    expect(providerQueryMock.mock.calls.some(([sql]) => String(sql).includes("FROM canonical_entities"))).toBe(true)
  })
})
