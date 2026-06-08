import { describe, expect, it, vi } from "vitest"

import { buildProjectGraphSnapshot } from "./project-graph-service"

function repositories() {
  return {
    memory: {
      listByProject: vi.fn(async () => [
        {
          id: "memory-1",
          type: "decision",
          title: "Use Postgres",
          content: "Use Postgres for durable state.",
          pinned: false,
          isArchived: false,
          metadata: {},
          updatedAt: "2026-06-01T00:00:00.000Z",
          capturedAt: "2026-06-01T00:00:00.000Z",
          lastReaffirmedAt: null,
          sourceSurface: "manual",
          sourceUrl: null,
          sourceConversationId: "conversation-1",
        },
      ]),
      getRelationsForProject: vi.fn(async () => []),
      getSimilarityEdgesForProject: vi.fn(async () => {
        throw new Error("similarity graph must not run")
      }),
    },
    sources: {
      listByProject: vi.fn(async () => []),
      listMemoryLinksByProject: vi.fn(async () => []),
    },
    entities: {
      listByProject: vi.fn(async () => [
        { id: "entity-1", name: "Postgres", kind: "technology" },
      ]),
      listMentionsByProject: vi.fn(async () => [
        {
          entityId: "entity-1",
          entityName: "Postgres",
          entityKind: "technology",
          memoryItemId: "memory-1",
          mentionText: "Postgres",
        },
      ]),
    },
    entityRelations: {
      listByProject: vi.fn(async () => []),
    },
    observations: {
      listByProject: vi.fn(async () => [
        {
          id: "observation-1",
          content: "Postgres stores durable state.",
          sourceMemoryItemId: "memory-1",
          subjectEntityId: "entity-1",
          objectEntityId: null,
          predicate: "stores",
          confidence: 0.9,
          validFrom: "2026-06-01T00:00:00.000Z",
          lifecycleState: "active",
          metadata: {},
        },
      ]),
    },
    sessions: {
      getGroupedSessions: vi.fn(async () => [
        {
          conversationId: "conversation-1",
          platform: "chatgpt",
          title: "Architecture",
          url: "https://chatgpt.com/c/conversation-1",
          captureCount: 2,
          totalTurns: 8,
          lastCapturedAt: "2026-06-01T00:00:00.000Z",
          firstCapturedAt: "2026-05-31T00:00:00.000Z",
          sessionIds: ["session-1"],
          allArchived: false,
        },
      ]),
    },
  }
}

describe("buildProjectGraphSnapshot", () => {
  it("builds a real persisted graph without synthetic nodes or similarity queries", async () => {
    const repos = repositories()

    const snapshot = await buildProjectGraphSnapshot(repos as never, "project-1", {
      density: "compact",
      includeEvidence: false,
    })

    expect(repos.memory.getSimilarityEdgesForProject).not.toHaveBeenCalled()
    expect(repos.memory.getRelationsForProject).toHaveBeenCalledWith("project-1", { limit: 180 })
    expect(repos.observations.listByProject).not.toHaveBeenCalled()
    expect(snapshot.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "memory:memory-1", kind: "memory" }),
      expect.objectContaining({ id: "entity:entity-1", kind: "entity" }),
      expect.objectContaining({ id: "conversation:conversation-1", kind: "conversation" }),
    ]))
    expect(snapshot.nodes.every((node) => ["memory", "entity", "source", "conversation", "observation"].includes(node.kind))).toBe(true)
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "entity:entity-1", target: "memory:memory-1", kind: "mentions" }),
      expect.objectContaining({ source: "conversation:conversation-1", target: "memory:memory-1", kind: "captured_in" }),
    ]))
  })

  it("adds observation evidence only when explicitly requested", async () => {
    const repos = repositories()

    const snapshot = await buildProjectGraphSnapshot(repos as never, "project-1", {
      density: "full",
      includeEvidence: true,
    })

    expect(repos.observations.listByProject).toHaveBeenCalledTimes(1)
    expect(snapshot.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "observation:observation-1", kind: "observation" }),
    ]))
    expect(snapshot.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "observation:observation-1",
        target: "memory:memory-1",
        kind: "supports",
      }),
      expect.objectContaining({
        source: "observation:observation-1",
        target: "entity:entity-1",
        kind: "supports",
      }),
    ]))
  })

  it("enforces compact snapshot budgets while retaining only valid edges", async () => {
    const repos = repositories()
    repos.memory.listByProject.mockResolvedValue(
      Array.from({ length: 120 }, (_, index) => ({
        id: `memory-${index}`,
        type: "decision",
        title: `Memory ${index}`,
        content: `Memory ${index}`,
        pinned: false,
        isArchived: false,
        metadata: {},
        updatedAt: "2026-06-01T00:00:00.000Z",
        capturedAt: "2026-06-01T00:00:00.000Z",
        lastReaffirmedAt: null,
        sourceSurface: "manual",
        sourceUrl: null,
        sourceConversationId: "conversation-1",
      })),
    )

    const snapshot = await buildProjectGraphSnapshot(repos as never, "project-1", {
      density: "compact",
      includeEvidence: false,
    })

    const nodeIds = new Set(snapshot.nodes.map((node) => node.id))
    expect(snapshot.nodes.length).toBeLessThanOrEqual(80)
    expect(snapshot.edges.length).toBeLessThanOrEqual(180)
    expect(snapshot.edges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))).toBe(true)
  })
})
