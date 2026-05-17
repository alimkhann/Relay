import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  consumeQuotaMock,
  createRepositoryBundleMock,
  createMemoryItemMock,
  generateEmbeddingMock,
  generateEmbeddingsMock,
  resolveViewerEntitlementsMock,
} = vi.hoisted(() => ({
  consumeQuotaMock: vi.fn(),
  createRepositoryBundleMock: vi.fn(),
  createMemoryItemMock: vi.fn(),
  generateEmbeddingMock: vi.fn(),
  generateEmbeddingsMock: vi.fn(),
  resolveViewerEntitlementsMock: vi.fn(),
}))

vi.mock("@relay/db", () => ({
  createRepositoryBundle: createRepositoryBundleMock,
}))

vi.mock("./memory-service", () => ({
  createMemoryItem: createMemoryItemMock,
}))

vi.mock("./embedding-service", () => ({
  EMBEDDING_MODEL: "text-embedding-004:rd",
  generateEmbedding: generateEmbeddingMock,
  generateEmbeddings: generateEmbeddingsMock,
}))

vi.mock("./entitlement-service", () => ({
  consumeQuota: consumeQuotaMock,
  resolveViewerEntitlements: resolveViewerEntitlementsMock,
}))

import {
  createExternalSource,
  hardDeleteProjectSource,
  promoteSourceCitation,
  promoteHighConfidenceSourceFacts,
  refreshExternalSource,
  searchProjectSources,
} from "./source-service"

describe("source-service", () => {
  beforeEach(() => {
    createRepositoryBundleMock.mockReset()
    createMemoryItemMock.mockReset()
    generateEmbeddingMock.mockReset()
    generateEmbeddingsMock.mockReset()
    consumeQuotaMock.mockReset()
    resolveViewerEntitlementsMock.mockReset()
    generateEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3])
    generateEmbeddingsMock.mockResolvedValue([[0.1, 0.2, 0.3]])
    resolveViewerEntitlementsMock.mockResolvedValue({
      plan: "starter",
      limits: {
        sourcesPerProject: 25,
        sourceStorageBytes: 1024 * 1024 * 1024,
        sourceFileMaxBytes: 50 * 1024 * 1024,
        sourceIngestionsDaily: 25,
        sourceEmbeddedTokensMonthly: 500_000,
        sourceBackedRecallDaily: 50,
        externalSourcesPerProject: 10,
        externalSourcePagesPerSource: 250,
        externalSourceIndexesDaily: 10,
        externalSourceSearchesDaily: 50,
        externalSourceRefreshesDaily: 5,
        externalSourceMcpActionsPerMinute: 20,
      },
    })
  })

  it("promotes only high-confidence source fact candidates through memory-service", async () => {
    const candidates = [
      {
        id: "candidate-1",
        projectId: "project-1",
        sourceId: "source-1",
        versionId: "version-1",
        memoryItemId: null,
        type: "decision",
        title: "Storage",
        content: "Relay stores raw source files in R2.",
        confidence: 0.94,
        status: "pending",
        metadata: {},
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
      },
      {
        id: "candidate-2",
        projectId: "project-1",
        sourceId: "source-1",
        versionId: "version-1",
        memoryItemId: null,
        type: "note",
        title: "Maybe",
        content: "This might be speculative.",
        confidence: 0.7,
        status: "pending",
        metadata: {},
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
      },
    ]
    const markPromoted = vi.fn()
    const linkMemory = vi.fn()
    createRepositoryBundleMock.mockReturnValue({
      sources: {
        listPendingFactCandidates: vi.fn().mockResolvedValue(candidates),
        markFactCandidatePromoted: markPromoted,
        linkMemory,
      },
    })
    createMemoryItemMock.mockResolvedValue({ id: "memory-1" })

    const result = await promoteHighConfidenceSourceFacts("user-1", "source-1")

    expect(result.promoted).toBe(1)
    expect(createMemoryItemMock).toHaveBeenCalledTimes(1)
    expect(createMemoryItemMock).toHaveBeenCalledWith("user-1", expect.objectContaining({
      projectId: "project-1",
      content: "Relay stores raw source files in R2.",
      sourceSurface: "web",
      metadata: expect.objectContaining({ sourceId: "source-1" }),
    }))
    expect(markPromoted).toHaveBeenCalledWith("candidate-1", "memory-1")
    expect(linkMemory).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: "source-1",
      memoryItemId: "memory-1",
    }))
  })

  it("creates external docs sources without auto-promoting memory", async () => {
    const source = {
      id: "source-1",
      projectId: "project-1",
      kind: "external_docs",
      status: "processing",
      displayName: "Paper",
      metadata: {},
    }
    const version = { id: "version-1" }
    const repos = {
      sources: {
        countExternalByProject: vi.fn().mockResolvedValue(0),
        sumStorageBytesByUser: vi.fn().mockResolvedValue(0),
        findBySourceUri: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(source),
        createVersion: vi.fn().mockResolvedValue(version),
        createChunks: vi.fn().mockResolvedValue([{ id: "chunk-1", content: "External research source content.", sourceId: "source-1", versionId: "version-1" }]),
        markVersionReady: vi.fn(),
        updateSourceStatus: vi.fn(),
        getById: vi.fn().mockResolvedValue(source),
        getLatestVersion: vi.fn().mockResolvedValue(version),
        listChunks: vi.fn().mockResolvedValue([]),
        listFactCandidates: vi.fn().mockResolvedValue([]),
      },
    }
    createRepositoryBundleMock.mockReturnValue(repos)

    const detail = await createExternalSource("user-1", {
      projectId: "project-1",
      url: "https://example.com/research",
      displayName: "Paper",
      kind: "external_docs",
      refreshPolicy: "manual",
      fetcher: async () => new Response("External research source content.", { headers: { "content-type": "text/plain" } }),
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    })

    expect(detail.source.id).toBe("source-1")
    expect(repos.sources.create).toHaveBeenCalledWith("user-1", expect.objectContaining({
      kind: "external_docs",
      sourceUri: "https://example.com/research",
      metadata: expect.objectContaining({
        external: expect.objectContaining({ sourceType: "website" }),
      }),
    }))
    expect(createMemoryItemMock).not.toHaveBeenCalled()
    expect(consumeQuotaMock).toHaveBeenCalledWith("user-1", "external_source_index_daily", "day", 10, 1, "starter")
  })

  it("searches source chunks with explicit source-backed quota", async () => {
    const searchChunks = vi.fn().mockResolvedValue([{ sourceId: "source-1", chunkId: "chunk-1", content: "Matched research", score: 0.88 }])
    createRepositoryBundleMock.mockReturnValue({ sources: { searchChunks } })

    const result = await searchProjectSources("user-1", "project-1", { query: "research", limit: 5 })

    expect(result.results).toHaveLength(1)
    expect(searchChunks).toHaveBeenCalledWith("project-1", expect.objectContaining({
      query: "research",
      limit: 5,
      queryEmbedding: [0.1, 0.2, 0.3],
    }))
    expect(consumeQuotaMock).toHaveBeenCalledWith("user-1", "external_source_search_daily", "day", 50, 1, "starter")
  })

  it("refuses to hard-delete a source that is not archived", async () => {
    const hardDelete = vi.fn()
    createRepositoryBundleMock.mockReturnValue({
      sources: {
        getById: vi.fn().mockResolvedValue({ id: "source-1", projectId: "project-1", status: "ready", storageObjectKey: "k" }),
        hardDelete,
      },
    })

    await expect(hardDeleteProjectSource("user-1", "project-1", "source-1")).rejects.toThrow(
      /Archive the source before deleting it permanently/,
    )
    expect(hardDelete).not.toHaveBeenCalled()
  })

  it("marks linked promoted memories potentially stale after changed refresh content", async () => {
    const source = {
      id: "source-1",
      projectId: "project-1",
      kind: "external_docs",
      status: "ready",
      displayName: "Docs",
      sourceUri: "https://example.com/docs",
      contentHash: "old-hash",
      metadata: { external: { refreshPolicy: "manual" } },
    }
    const version = { id: "version-2" }
    const markLinkedMemoriesPotentiallyStale = vi.fn()
    const repos = {
      sources: {
        countExternalByProject: vi.fn().mockResolvedValue(0),
        sumStorageBytesByUser: vi.fn().mockResolvedValue(0),
        getById: vi.fn().mockResolvedValue(source),
        createVersion: vi.fn().mockResolvedValue(version),
        createChunks: vi.fn().mockResolvedValue([{ id: "chunk-1", content: "Changed docs content.", sourceId: "source-1", versionId: "version-2" }]),
        markVersionReady: vi.fn(),
        updateSourceStatus: vi.fn(),
        getLatestVersion: vi.fn().mockResolvedValue(version),
        listChunks: vi.fn().mockResolvedValue([]),
        listFactCandidates: vi.fn().mockResolvedValue([]),
        markLinkedMemoriesPotentiallyStale,
      },
    }
    createRepositoryBundleMock.mockReturnValue(repos)

    await refreshExternalSource("user-1", "project-1", "source-1", {
      fetcher: async () => new Response("Changed docs content.", { headers: { "content-type": "text/plain" } }),
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    })

    expect(markLinkedMemoriesPotentiallyStale).toHaveBeenCalledWith("source-1", expect.objectContaining({
      sourceVersionId: "version-2",
      previousContentHash: "old-hash",
    }))
    expect(repos.sources.updateSourceStatus).toHaveBeenCalledWith("source-1", "ready", expect.objectContaining({
      contentHash: expect.any(String),
      staleReason: null,
    }))
  })

  it("hard-deletes an archived source (cascade row removal)", async () => {
    const hardDelete = vi.fn()
    createRepositoryBundleMock.mockReturnValue({
      sources: {
        getById: vi.fn().mockResolvedValue({ id: "source-1", projectId: "project-1", status: "archived", storageObjectKey: null }),
        hardDelete,
      },
    })

    const result = await hardDeleteProjectSource("user-1", "project-1", "source-1")

    expect(result).toEqual({ ok: true })
    expect(hardDelete).toHaveBeenCalledWith("source-1")
  })

  it("promotes a selected citation into memory only on explicit action", async () => {
    const chunk = {
      id: "chunk-1",
      sourceId: "source-1",
      versionId: "version-1",
      projectId: "project-1",
      content: "Citation content.",
      locator: { url: "https://example.com/paper" },
      metadata: {},
    }
    const repos = {
      sources: {
        getById: vi.fn().mockResolvedValue({ id: "source-1", projectId: "project-1", displayName: "Paper" }),
        getChunkById: vi.fn().mockResolvedValue(chunk),
        linkMemory: vi.fn(),
      },
    }
    createRepositoryBundleMock.mockReturnValue(repos)
    createMemoryItemMock.mockResolvedValue({ id: "memory-1" })

    const result = await promoteSourceCitation("user-1", "project-1", "source-1", {
      chunkId: "chunk-1",
      type: "note",
      content: "Citation content.",
    })

    expect(result.memoryItemId).toBe("memory-1")
    expect(createMemoryItemMock).toHaveBeenCalledWith("user-1", expect.objectContaining({
      content: "Citation content.",
      tags: ["source", "external-source"],
      metadata: expect.objectContaining({ sourceId: "source-1", sourceChunkId: "chunk-1" }),
    }))
    expect(repos.sources.linkMemory).toHaveBeenCalledWith(expect.objectContaining({ memoryItemId: "memory-1" }))
  })
})
