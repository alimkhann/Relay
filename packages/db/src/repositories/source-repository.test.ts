import { describe, expect, it } from "vitest"

import type { DatabaseProvider, DatabaseRow } from "../store/provider"
import { SourceRepository } from "./source-repository"

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

describe("SourceRepository external source helpers", () => {
  it("finds active sources by canonical source URI", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new SourceRepository(provider)

    await repo.findBySourceUri("project-1", "https://example.com/docs")

    expect(calls[0]!.text).toContain("source_uri = $2")
    expect(calls[0]!.text).toContain("status <> 'archived'")
    expect(calls[0]!.values).toEqual(["project-1", "https://example.com/docs"])
  })

  it("searches ready source chunks with hybrid vector and lexical ranking when embeddings are available", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new SourceRepository(provider)

    await repo.searchChunks("project-1", {
      query: "attention mechanisms",
      kinds: ["external_docs"],
      queryEmbedding: [0.1, 0.2, 0.3],
      limit: 7,
    })

    const sql = calls[0]!.text
    expect(sql).toContain("websearch_to_tsquery")
    expect(sql).toContain("embedding <=>")
    expect(sql).toContain("s.kind = ANY")
    expect(sql).toContain("s.status = 'ready'")
    expect(calls[0]!.values).toContain("attention mechanisms")
    expect(calls[0]!.values).toContainEqual(["external_docs"])
    expect(calls[0]!.values).toContain(7)
  })

  it("marks linked promoted memories stale when a source changes", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new SourceRepository(provider)

    await repo.markLinkedMemoriesPotentiallyStale("source-1", {
      sourceVersionId: "version-2",
      previousContentHash: "old",
      contentHash: "new",
      changedAt: "2026-05-18T00:00:00.000Z",
    })

    expect(calls[0]!.text).toContain("source_memory_links")
    expect(calls[0]!.text).toContain("'potentially_stale', true")
    expect(calls[0]!.values).toEqual(["source-1", "version-2", "old", "new", "2026-05-18T00:00:00.000Z"])
  })

  it("counts external sources separately from uploaded files", async () => {
    const { provider, calls } = makeFakeProvider([{ count: 3 }])
    const repo = new SourceRepository(provider)

    await expect(repo.countExternalByProject("project-1")).resolves.toBe(3)
    expect(calls[0]!.text).toContain("kind in ('external_docs', 'package_docs')")
  })
})
