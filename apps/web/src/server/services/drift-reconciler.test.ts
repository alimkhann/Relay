import { describe, expect, it, vi } from "vitest"

import type { RepositoryBundle } from "@relay/db"
import type { MemoryEventRow, MemoryItemRow } from "@relay/shared"

import { detectCrossSurfaceDrifts, listDisputedItems } from "./drift-reconciler"

function makeItem(overrides: Partial<MemoryItemRow> = {}): MemoryItemRow {
  return {
    id: "mem-1",
    projectId: "proj-1",
    sourceTurnId: null,
    type: "decision",
    title: null,
    content: "Use Postgres for production database",
    pinned: false,
    isArchived: false,
    sortOrder: null,
    tags: [],
    metadata: {},
    createdBy: "user-1",
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z",
    sourceSurface: null,
    sourceConversationId: null,
    sourceUrl: null,
    capturedAt: "2026-04-12T00:00:00.000Z",
    derivedFrom: null,
    embedding: null,
    embeddingModel: null,
    forgetAfter: null,
    lastReaffirmedAt: null,
    ...overrides,
  }
}

function makeEvent(overrides: Partial<MemoryEventRow> = {}): MemoryEventRow {
  return {
    id: "ev-1",
    projectId: "proj-1",
    memoryItemId: "mem-1",
    eventType: "created",
    sourceSurface: "mcp",
    userId: "user-1",
    payload: {},
    createdAt: "2026-04-12T00:00:00.000Z",
    ...overrides,
  }
}

function makeRepos(
  events: MemoryEventRow[],
  items: Map<string, MemoryItemRow>,
  listByProject: MemoryItemRow[] = [],
): {
  repos: RepositoryBundle
  updateSpy: ReturnType<typeof vi.fn>
  createEventSpy: ReturnType<typeof vi.fn>
} {
  const updateSpy = vi.fn().mockImplementation(async (_id: string, _patch: Partial<MemoryItemRow>) => {
    return makeItem()
  })
  const createEventSpy = vi.fn().mockResolvedValue(undefined)

  const repos = {
    memoryEvents: {
      listRecentForProject: vi.fn().mockResolvedValue(events),
      create: createEventSpy,
    },
    memory: {
      getById: vi.fn().mockImplementation(async (id: string) => items.get(id) ?? null),
      update: updateSpy,
      listByProject: vi.fn().mockResolvedValue(listByProject),
    },
  } as unknown as RepositoryBundle

  return { repos, updateSpy, createEventSpy }
}

describe("detectCrossSurfaceDrifts", () => {
  it("returns empty when there are no events", async () => {
    const { repos } = makeRepos([], new Map())
    const result = await detectCrossSurfaceDrifts(repos, "proj-1")
    expect(result).toEqual({ driftsDetected: 0, itemsDisputed: 0, groups: [] })
  })

  it("groups 2 surfaces on same topic — winner=newest capturedAt, loser marked disputed", async () => {
    // Identical content → substring check in isSameTopic passes cleanly.
    const older = makeItem({
      id: "mem-older",
      content: "adopt Postgres as primary production datastore",
      capturedAt: "2026-04-12T00:00:00.000Z",
      sourceSurface: "chatgpt",
    })
    const newer = makeItem({
      id: "mem-newer",
      content: "adopt Postgres as primary production datastore",
      capturedAt: "2026-04-12T00:05:00.000Z",
      sourceSurface: "mcp",
    })
    const events = [
      makeEvent({ id: "e1", memoryItemId: "mem-older", sourceSurface: "chatgpt" }),
      makeEvent({ id: "e2", memoryItemId: "mem-newer", sourceSurface: "mcp" }),
    ]
    const items = new Map([
      ["mem-older", older],
      ["mem-newer", newer],
    ])
    const { repos, updateSpy } = makeRepos(events, items)

    const result = await detectCrossSurfaceDrifts(repos, "proj-1")

    expect(result.driftsDetected).toBe(1)
    expect(result.itemsDisputed).toBe(1)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]!.winner.id).toBe("mem-newer")
    expect(result.groups[0]!.losers.map((l) => l.id)).toEqual(["mem-older"])
    expect(result.groups[0]!.surfaces.sort()).toEqual(["chatgpt", "mcp"])

    expect(updateSpy).toHaveBeenCalledTimes(1)
    const [updatedId, patch] = updateSpy.mock.calls[0]!
    expect(updatedId).toBe("mem-older")
    expect(patch.metadata.conflictStatus).toBe("disputed")
    expect(patch.metadata.driftWinnerId).toBe("mem-newer")
  })

  it("3+ surfaces → single newest winner, rest losers", async () => {
    const base = "adopt Redis as the primary caching layer"
    const a = makeItem({
      id: "mem-a",
      content: base,
      capturedAt: "2026-04-12T00:00:00.000Z",
      sourceSurface: "chatgpt",
    })
    const b = makeItem({
      id: "mem-b",
      content: base,
      capturedAt: "2026-04-12T00:10:00.000Z",
      sourceSurface: "claude",
    })
    const c = makeItem({
      id: "mem-c",
      content: base,
      capturedAt: "2026-04-12T00:20:00.000Z",
      sourceSurface: "mcp",
    })
    const events = [
      makeEvent({ id: "e1", memoryItemId: "mem-a", sourceSurface: "chatgpt" }),
      makeEvent({ id: "e2", memoryItemId: "mem-b", sourceSurface: "claude" }),
      makeEvent({ id: "e3", memoryItemId: "mem-c", sourceSurface: "mcp" }),
    ]
    const items = new Map([
      ["mem-a", a],
      ["mem-b", b],
      ["mem-c", c],
    ])
    const { repos, updateSpy } = makeRepos(events, items)

    const result = await detectCrossSurfaceDrifts(repos, "proj-1")

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]!.winner.id).toBe("mem-c")
    expect(result.groups[0]!.losers).toHaveLength(2)
    expect(result.groups[0]!.surfaces).toHaveLength(3)
    expect(updateSpy).toHaveBeenCalledTimes(2)
  })

  it("markDisputed: false leaves losers untouched but still returns groups", async () => {
    const base = "adopt Postgres as primary production datastore"
    const older = makeItem({
      id: "mem-a",
      content: base,
      capturedAt: "2026-04-12T00:00:00.000Z",
      sourceSurface: "chatgpt",
    })
    const newer = makeItem({
      id: "mem-b",
      content: base,
      capturedAt: "2026-04-12T00:05:00.000Z",
      sourceSurface: "mcp",
    })
    const events = [
      makeEvent({ id: "e1", memoryItemId: "mem-a", sourceSurface: "chatgpt" }),
      makeEvent({ id: "e2", memoryItemId: "mem-b", sourceSurface: "mcp" }),
    ]
    const items = new Map([
      ["mem-a", older],
      ["mem-b", newer],
    ])
    const { repos, updateSpy } = makeRepos(events, items)

    const result = await detectCrossSurfaceDrifts(repos, "proj-1", { markDisputed: false })

    expect(result.groups).toHaveLength(1)
    expect(result.itemsDisputed).toBe(0)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("ignores items whose type is not decision/constraint/fact", async () => {
    const base = "adopt Postgres as primary production datastore"
    const a = makeItem({
      id: "mem-a",
      type: "note",
      content: base,
      sourceSurface: "chatgpt",
    })
    const b = makeItem({
      id: "mem-b",
      type: "note",
      content: base,
      capturedAt: "2026-04-12T00:05:00.000Z",
      sourceSurface: "mcp",
    })
    const events = [
      makeEvent({ id: "e1", memoryItemId: "mem-a", sourceSurface: "chatgpt" }),
      makeEvent({ id: "e2", memoryItemId: "mem-b", sourceSurface: "mcp" }),
    ]
    const { repos } = makeRepos(events, new Map([["mem-a", a], ["mem-b", b]]))

    const result = await detectCrossSurfaceDrifts(repos, "proj-1")
    expect(result.groups).toHaveLength(0)
  })

  it("skips losers already marked disputed (idempotent)", async () => {
    const base = "adopt Postgres as primary production datastore"
    const older = makeItem({
      id: "mem-a",
      content: base,
      capturedAt: "2026-04-12T00:00:00.000Z",
      sourceSurface: "chatgpt",
      metadata: { conflictStatus: "disputed" },
    })
    const newer = makeItem({
      id: "mem-b",
      content: base,
      capturedAt: "2026-04-12T00:05:00.000Z",
      sourceSurface: "mcp",
    })
    const events = [
      makeEvent({ id: "e1", memoryItemId: "mem-a", sourceSurface: "chatgpt" }),
      makeEvent({ id: "e2", memoryItemId: "mem-b", sourceSurface: "mcp" }),
    ]
    const { repos, updateSpy } = makeRepos(events, new Map([["mem-a", older], ["mem-b", newer]]))

    const result = await detectCrossSurfaceDrifts(repos, "proj-1")
    expect(result.driftsDetected).toBe(1)
    expect(result.itemsDisputed).toBe(0)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

describe("listDisputedItems", () => {
  it("returns only items with disputed/contested conflictStatus, capped at limit", async () => {
    const rows = [
      makeItem({ id: "a", metadata: { conflictStatus: "disputed" } }),
      makeItem({ id: "b", metadata: {} }),
      makeItem({ id: "c", metadata: { conflictStatus: "contested" } }),
      makeItem({ id: "d", metadata: { conflictStatus: "disputed" } }),
      makeItem({ id: "e", metadata: { conflictStatus: "disputed" } }),
    ]
    const { repos } = makeRepos([], new Map(), rows)

    const result = await listDisputedItems(repos, "proj-1", 2)
    expect(result).toHaveLength(2)
    expect(result.every((r) => ["disputed", "contested"].includes(String(r.metadata.conflictStatus)))).toBe(true)
  })

  it("returns empty when no items are disputed", async () => {
    const rows = [makeItem({ id: "a" }), makeItem({ id: "b" })]
    const { repos } = makeRepos([], new Map(), rows)

    const result = await listDisputedItems(repos, "proj-1")
    expect(result).toEqual([])
  })
})
