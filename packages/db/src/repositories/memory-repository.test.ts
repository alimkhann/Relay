import { describe, expect, it } from "vitest"

import type { DatabaseProvider, DatabaseRow } from "../store/provider"
import { MemoryRepository } from "./memory-repository"

interface CapturedCall {
  text: string
  values: unknown[]
}

function makeFakeProvider(responseRows: DatabaseRow[] = []): {
  provider: DatabaseProvider
  calls: CapturedCall[]
} {
  const calls: CapturedCall[] = []
  const provider: DatabaseProvider = {
    mode: "local",
    async query<T extends DatabaseRow = DatabaseRow>(text: string, values: unknown[] = []): Promise<T[]> {
      calls.push({ text, values })
      return responseRows as T[]
    },
    async transaction<T>(callback: (provider: DatabaseProvider) => Promise<T>): Promise<T> {
      return callback(provider)
    },
  }
  return { provider, calls }
}

describe("MemoryRepository.hybridSearch SQL shape", () => {
  const embedding = Array.from({ length: 4 }, (_, i) => i * 0.1)
  const query = "production datastore"

  it("issues base query with websearch_to_tsquery (not plainto) and returns empty array when no rows", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)
    const result = await repo.hybridSearch("proj-1", query, embedding)
    expect(result).toEqual([])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.text).toContain("websearch_to_tsquery")
    expect(calls[0]!.text).not.toContain("plainto_tsquery")
  })

  it("includes captured_at + source_surface in selected columns (D2)", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)
    await repo.hybridSearch("proj-1", query, embedding)
    const sql = calls[0]!.text
    expect(sql).toContain("m.captured_at")
    expect(sql).toContain("m.source_surface")
  })

  it("does not return search_vector in list payloads", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)

    await repo.listByProject("proj-1")

    expect(calls[0]!.text).not.toContain("search_vector")
  })

  it("does not return search_vector in hybrid search payloads", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)

    await repo.hybridSearch("proj-1", query, embedding)

    expect(calls[0]!.text).toContain("search_vector @@")
    expect(calls[0]!.text).not.toContain("m.search_vector")
  })

  it("applies dateRange.from / dateRange.to as captured_at bounds (D1)", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)
    await repo.hybridSearch("proj-1", query, embedding, {
      dateRange: { from: "2026-01-01T00:00:00Z", to: "2026-02-01T00:00:00Z" },
    })
    const sql = calls[0]!.text
    expect(sql).toMatch(/captured_at >= \$\d+::timestamptz/)
    expect(sql).toMatch(/captured_at <= \$\d+::timestamptz/)
    expect(calls[0]!.values).toContain("2026-01-01T00:00:00Z")
    expect(calls[0]!.values).toContain("2026-02-01T00:00:00Z")
  })

  it("applies sourceConversationId filter", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)
    await repo.hybridSearch("proj-1", query, embedding, {
      sourceConversationId: "conv-abc",
    })
    const sql = calls[0]!.text
    expect(sql).toMatch(/source_conversation_id = \$\d+/)
    expect(calls[0]!.values).toContain("conv-abc")
  })

  it("applies surfaces array filter", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)
    await repo.hybridSearch("proj-1", query, embedding, { surfaces: ["mcp", "chatgpt"] })
    const sql = calls[0]!.text
    expect(sql).toMatch(/source_surface = ANY\(\$\d+::text\[\]\)/)
    expect(calls[0]!.values).toContainEqual(["mcp", "chatgpt"])
  })

  it("lists personal items missing valid Folk categories without returning encrypted raw rows", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)
    await repo.listPersonalItemsMissingCategory("personal-1", 25)
    const sql = calls[0]!.text
    expect(sql).toContain("metadata->>'personalCategory'")
    expect(sql).toContain("coalesce(lifecycle_state, 'active') <> 'forgotten'")
    expect(sql).not.toContain("search_vector")
    expect(calls[0]!.values[0]).toBe("personal-1")
    expect(calls[0]!.values[2]).toBe(25)
  })

  it("lists MCP and Ask Relay note rows that still need project type backfill", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)
    await repo.listAgentNoteTypeBackfillCandidates("proj-1", 10)
    const sql = calls[0]!.text
    expect(sql).toContain("type = 'note'")
    expect(sql).toContain("source_surface = any")
    expect(sql).toContain("metadata->>'taxonomyBackfilledAt' is null")
    expect(calls[0]!.values).toEqual(["proj-1", ["mcp", "ask_relay"], 10])
  })

  it("includes a supersedes-aware NOT EXISTS subquery by default (D4)", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)
    await repo.hybridSearch("proj-1", query, embedding)
    const sql = calls[0]!.text
    expect(sql).toContain("memory_relations")
    expect(sql).toContain("relation_type = 'supersedes'")
    expect(sql).toContain("not exists")
  })

  it("omits the supersedes NOT EXISTS when includeSuperseded=true", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)
    await repo.hybridSearch("proj-1", query, embedding, { includeSuperseded: true })
    const sql = calls[0]!.text
    expect(sql).not.toContain("relation_type = 'supersedes'")
  })

  it("applies a recency decay multiplier using last_reaffirmed_at / captured_at / created_at (D3)", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)
    await repo.hybridSearch("proj-1", query, embedding, { recencyHalfLifeDays: 45 })
    const sql = calls[0]!.text
    expect(sql).toContain("last_reaffirmed_at")
    expect(sql).toContain("power(2.0")
    expect(calls[0]!.values).toContain(45)
  })

  it("applies a compaction penalty for demoted memory in hybrid search ranking", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)
    await repo.hybridSearch("proj-1", query, embedding)
    const sql = calls[0]!.text
    expect(sql).toContain("metadata->>'compactionState'")
    expect(sql).toContain("covered_by_canon")
    expect(sql).toContain("covered_by_summary")
    expect(sql).toContain("historical_only")
  })

  it("defaults recency half-life to 30 days when not supplied", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)
    await repo.hybridSearch("proj-1", query, embedding)
    expect(calls[0]!.values).toContain(30)
  })

  it("maps rows back with capturedAt + sourceSurface on the returned chunk", async () => {
    const row: DatabaseRow = {
      id: "mem-1",
      project_id: "proj-1",
      source_turn_id: null,
      type: "decision",
      title: null,
      content: "adopt Postgres as primary production datastore",
      pinned: false,
      is_archived: false,
      sort_order: null,
      tags: [],
      metadata: {},
      created_by: "user-1",
      created_at: "2026-04-12T00:00:00.000Z",
      updated_at: "2026-04-12T00:00:00.000Z",
      source_surface: "mcp",
      source_conversation_id: null,
      source_url: null,
      captured_at: "2026-04-12T00:00:00.000Z",
      derived_from: null,
      search_vector: null,
      embedding_model: null,
      forget_after: null,
      last_reaffirmed_at: null,
      similarity: 0.92,
      match_type: "semantic",
    }
    const { provider } = makeFakeProvider([row])
    const repo = new MemoryRepository(provider)
    const result = await repo.hybridSearch("proj-1", query, embedding)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe("mem-1")
    expect(result[0]!.capturedAt).toBe("2026-04-12T00:00:00.000Z")
    expect(result[0]!.sourceSurface).toBe("mcp")
    expect(result[0]!.similarity).toBeCloseTo(0.92)
    expect(result[0]!.matchType).toBe("semantic")
  })
})

describe("MemoryRepository.updateEmbeddingsBatch", () => {
  it("casts id array as ::uuid[] (A2 correctness fix)", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new MemoryRepository(provider)
    await repo.updateEmbeddingsBatch([
      { id: "a", embedding: [0.1, 0.2], model: "text-embedding-004" },
      { id: "b", embedding: [0.3, 0.4], model: "text-embedding-004" },
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.text).toContain("::uuid[]")
    expect(calls[0]!.text).not.toContain("::text[]")
  })
})
