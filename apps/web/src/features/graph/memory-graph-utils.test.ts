import { describe, expect, it } from "vitest"
import type { ProjectGraphSnapshot } from "@relay/shared"

import { filterGraphData, snapshotToGraphData } from "./memory-graph-utils"

function snapshot(): ProjectGraphSnapshot {
  return {
    projectId: "project-1",
    density: "full",
    includeEvidence: true,
    nodes: [
      {
        id: "memory:memory-1",
        kind: "memory",
        label: "Use Postgres",
        content: "Use Postgres.",
        updatedAt: "2026-06-01T00:00:00.000Z",
        metadata: { personalCategory: "concept" },
        memory: {
          id: "memory-1",
          type: "decision",
          title: "Use Postgres",
          pinned: false,
          sourceSurface: "manual",
          sourceUrl: null,
          capturedAt: "2026-06-01T00:00:00.000Z",
          lastReaffirmedAt: null,
        },
      },
      {
        id: "entity:entity-1",
        kind: "entity",
        label: "Postgres",
        content: "technology: Postgres",
        updatedAt: "",
        metadata: {},
        entity: { id: "entity-1", kind: "technology" },
      },
      {
        id: "observation:observation-1",
        kind: "observation",
        label: "Postgres stores state",
        content: "Postgres stores state.",
        updatedAt: "2026-06-01T00:00:00.000Z",
        metadata: {},
        observation: { id: "observation-1", predicate: "stores", confidence: 0.9 },
      },
    ],
    edges: [
      {
        id: "mentions-1",
        source: "entity:entity-1",
        target: "memory:memory-1",
        kind: "mentions",
        label: "mentions",
        confidence: 0.84,
      },
      {
        id: "supports-1",
        source: "observation:observation-1",
        target: "memory:memory-1",
        kind: "supports",
        label: "supports",
        confidence: 0.9,
      },
    ],
    stats: { nodeCount: 3, edgeCount: 2, isolatedNodeCount: 0, truncated: false },
  }
}

describe("real evidence graph adapter", () => {
  it("maps persisted snapshot nodes and edges without synthetic topology", () => {
    const graph = snapshotToGraphData(snapshot())

    expect(graph.nodes.map((node) => node.kind)).toEqual(["memory", "entity", "observation"])
    expect(graph.nodes.some((node) => node.id.startsWith("__"))).toBe(false)
    expect(graph.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ relationType: "mentions", label: "mentions" }),
      expect.objectContaining({ relationType: "supports", label: "supports" }),
    ]))
  })

  it("keeps real isolated nodes", () => {
    const input = snapshot()
    input.edges = []

    const graph = snapshotToGraphData(input)

    expect(graph.nodes).toHaveLength(3)
    expect(graph.links).toHaveLength(0)
  })

  it("filters nodes and drops edges with hidden endpoints", () => {
    const graph = snapshotToGraphData(snapshot())
    const filtered = filterGraphData(graph, {
      nodeKinds: new Set(["memory", "entity"]),
      memoryTypes: new Set(["decision"]),
      personalCategories: new Set(["concept"]),
      edgeKinds: new Set(["mentions"]),
    })

    expect(filtered.nodes.map((node) => node.kind)).toEqual(["memory", "entity"])
    expect(filtered.links).toEqual([
      expect.objectContaining({ relationType: "mentions" }),
    ])
  })

  it("excludes uncategorized memory nodes when personal category filters are active", () => {
    const input = snapshot()
    input.nodes.push({
      id: "memory:memory-2",
      kind: "memory",
      label: "Untagged note",
      content: "No category.",
      updatedAt: "2026-06-02T00:00:00.000Z",
      metadata: {},
      memory: {
        id: "memory-2",
        type: "note",
        title: null,
        pinned: false,
        sourceSurface: "manual",
        sourceUrl: null,
        capturedAt: "2026-06-02T00:00:00.000Z",
        lastReaffirmedAt: null,
      },
    })

    const filtered = filterGraphData(snapshotToGraphData(input), {
      personalCategories: new Set(["concept"]),
    })

    expect(filtered.nodes.some((node) => node.id === "memory:memory-1")).toBe(true)
    expect(filtered.nodes.some((node) => node.id === "memory:memory-2")).toBe(false)
  })
})
