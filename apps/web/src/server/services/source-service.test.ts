import { beforeEach, describe, expect, it, vi } from "vitest"

const { createRepositoryBundleMock, createMemoryItemMock } = vi.hoisted(() => ({
  createRepositoryBundleMock: vi.fn(),
  createMemoryItemMock: vi.fn(),
}))

vi.mock("@relay/db", () => ({
  createRepositoryBundle: createRepositoryBundleMock,
}))

vi.mock("./memory-service", () => ({
  createMemoryItem: createMemoryItemMock,
}))

import { promoteHighConfidenceSourceFacts } from "./source-service"

describe("source-service", () => {
  beforeEach(() => {
    createRepositoryBundleMock.mockReset()
    createMemoryItemMock.mockReset()
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
})
