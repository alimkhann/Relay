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
    expect(sql).toContain("source_kind = ANY")
    expect(sql).toContain("source_status = 'ready'")
    expect(calls[0]!.values).toContain("attention mechanisms")
    expect(calls[0]!.values).toContainEqual(["external_docs"])
    expect(calls[0]!.values).toContain(7)
  })

  it("searches source chunks without returning stored embeddings", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new SourceRepository(provider)

    await repo.searchChunks("project-1", {
      query: "attention mechanisms",
      queryEmbedding: [0.1, 0.2, 0.3],
      limit: 7,
    })

    const sql = calls[0]!.text
    expect(sql).toContain("embedding <=>")
    expect(sql).not.toMatch(/c\.embedding\s*,/)
  })

  it("greps ready source chunks with literal matching and citation joins", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new SourceRepository(provider)

    await repo.grepChunks("project-1", {
      query: "constructEvent",
      sourceId: "source-1",
      limit: 5,
    })

    const sql = calls[0]!.text
    expect(sql).toContain("position(lower($2) in lower(c.content)) > 0")
    expect(sql).toContain("join project_sources s on s.id = c.source_id")
    expect(sql).toContain("left join source_versions v on v.id = c.version_id")
    expect(calls[0]!.values).toEqual(["project-1", "constructEvent", "source-1", 5])
  })

  it("stores imported external citations with provider provenance", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new SourceRepository(provider)

    await repo.createExternalCitations([{
      projectId: "project-1",
      sourceId: "source-1",
      versionId: "version-1",
      chunkId: "chunk-1",
      provider: "context7",
      providerSourceId: "/websites/stripe",
      title: "Webhooks",
      url: "https://docs.stripe.com/webhooks",
      contentHash: "hash-1",
      locator: { section: "verify" },
      metadata: { importedAt: "2026-05-18T00:00:00.000Z" },
    }])

    expect(calls[0]!.text).toContain("insert into source_external_citations")
    expect(calls[0]!.values).toContain("context7")
    expect(calls[0]!.values).toContain("/websites/stripe")
    expect(calls[0]!.values).toContain("https://docs.stripe.com/webhooks")
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

  it("records indexing jobs for structured source ingestion", async () => {
    const { provider, calls } = makeFakeProvider([{ id: "job-1", source_id: "source-1", project_id: "project-1", status: "queued", kind: "index", progress: 0, pages_total: 0, pages_indexed: 0, error_message: null, metadata: {}, created_at: "2026-05-18T00:00:00.000Z", updated_at: "2026-05-18T00:00:00.000Z", finished_at: null }])
    const repo = new SourceRepository(provider)

    const job = await repo.createIndexJob("user-1", {
      sourceId: "source-1",
      projectId: "project-1",
      kind: "index",
      metadata: { rootUrl: "https://example.com/docs" },
    })

    expect(job.id).toBe("job-1")
    expect(calls[0]!.text).toContain("insert into source_index_jobs")
    expect(calls[0]!.values).toEqual(["source-1", "project-1", "index", 0, 0, 0, JSON.stringify({ rootUrl: "https://example.com/docs" }), "user-1"])
  })

  it("stores structured source pages with hashes and locators", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new SourceRepository(provider)

    await repo.upsertSourcePages([{
      sourceId: "source-1",
      versionId: "version-1",
      projectId: "project-1",
      url: "https://example.com/docs/webhooks",
      title: "Webhooks",
      headingPath: ["Payments", "Webhooks"],
      content: "Webhook docs",
      contentHash: "hash-1",
      contentType: "text/markdown",
      metadata: { etag: "abc" },
    }])

    expect(calls[0]!.text).toContain("insert into source_pages")
    expect(calls[0]!.text).toContain("on conflict (source_id, url)")
    expect(calls[0]!.values).toContain("https://example.com/docs/webhooks")
    expect(calls[0]!.values).toContain("hash-1")
  })

  it("lists source page metadata without returning page content", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new SourceRepository(provider)

    await repo.listSourcePages("project-1", { sourceId: "source-1", limit: 25 })

    const sql = calls[0]!.text
    expect(sql).toContain("from source_pages")
    expect(sql).toContain("content_hash")
    expect(sql).not.toMatch(/select[\s\S]*\bcontent,/i)
    expect(calls[0]!.values).toEqual(["project-1", "source-1", 25])
  })

  it("upserts global sources for project-shared public docs", async () => {
    const { provider, calls } = makeFakeProvider([{ id: "global-1", source_type: "documentation", canonical_url: "https://example.com/docs", display_name: "Example Docs", trust_score: 0.8, metadata: {}, created_at: "2026-05-18T00:00:00.000Z", updated_at: "2026-05-18T00:00:00.000Z" }])
    const repo = new SourceRepository(provider)

    const source = await repo.upsertGlobalSource({
      sourceType: "documentation",
      canonicalUrl: "https://example.com/docs",
      displayName: "Example Docs",
      trustScore: 0.8,
      metadata: { verified: true },
    })

    expect(source.id).toBe("global-1")
    expect(calls[0]!.text).toContain("insert into global_sources")
    expect(calls[0]!.text).toContain("on conflict (source_type, canonical_url)")
  })

  it("links a canonical global source to a project source subscription", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new SourceRepository(provider)

    await repo.linkGlobalSourceToProject({
      projectId: "project-1",
      globalSourceId: "global-1",
      projectSourceId: "source-1",
      metadata: { linkedAt: "2026-05-18T00:00:00.000Z" },
    })

    expect(calls[0]!.text).toContain("insert into project_global_source_links")
    expect(calls[0]!.text).toContain("on conflict (project_id, global_source_id)")
    expect(calls[0]!.values).toEqual([
      "project-1",
      "global-1",
      "source-1",
      JSON.stringify({ linkedAt: "2026-05-18T00:00:00.000Z" }),
    ])
  })

  it("counts external sources separately from uploaded files", async () => {
    const { provider, calls } = makeFakeProvider([{ count: 3 }])
    const repo = new SourceRepository(provider)

    await expect(repo.countExternalByProject("project-1")).resolves.toBe(3)
    expect(calls[0]!.text).toContain("kind in ('external_docs', 'package_docs')")
  })
})
