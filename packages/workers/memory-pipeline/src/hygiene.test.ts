import { describe, expect, it, vi } from "vitest"

import { runHygieneTick } from "./hygiene"

const HALF_LIVES = { note: 10 }

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Fake provider returning one stale memory_item for the decay sweep and empty
 * sets for the observation + resurrection passes. Records the writes so the
 * test can assert the archive UPDATE + event INSERT fire (or don't, in dry-run).
 */
function makeProvider(staleItem: Record<string, unknown> | null) {
  const writes: string[] = []
  const provider = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("FROM memory_items") && sql.includes("ORDER BY coalesce")) {
        return staleItem ? [staleItem] : []
      }
      if (sql.includes("FROM observations")) return []
      if (sql.includes("WITH new_facts AS")) return []
      // UPDATE / INSERT writes.
      writes.push(sql)
      return []
    }),
  }
  return { provider, writes }
}

function makeRepos(provider: { query: ReturnType<typeof vi.fn> }) {
  return {
    provider: provider as never,
    memory: {} as never,
    observation: { setLifecycle: vi.fn(async () => {}) } as never,
    entityRelation: {} as never,
    space: {} as never,
  }
}

const STALE_ITEM = {
  id: "m1",
  project_id: "p1",
  space_id: "s1",
  type: "note",
  content: "old fact",
  pinned: false,
  captured_at: daysAgo(200),
  created_at: daysAgo(200),
  last_reaffirmed_at: null,
  metadata: {},
  lifecycle_state: "active",
  valid_until: null,
}

describe("runHygieneTick", () => {
  it("archives a long-decayed item and writes an event when not in dry-run", async () => {
    const { provider, writes } = makeProvider(STALE_ITEM)
    const repos = makeRepos(provider)

    const result = await runHygieneTick(repos, {
      spaceIds: ["s1"],
      halfLifeDays: HALF_LIVES,
      dryRun: false,
    })

    expect(result.itemsArchived).toBe(1)
    expect(writes.some((w) => w.includes("lifecycle_state = 'archived'"))).toBe(true)
    expect(writes.some((w) => w.includes("INSERT INTO memory_events"))).toBe(true)
  })

  it("proposes but does not write in dry-run mode", async () => {
    const { provider, writes } = makeProvider(STALE_ITEM)
    const repos = makeRepos(provider)

    const result = await runHygieneTick(repos, {
      spaceIds: ["s1"],
      halfLifeDays: HALF_LIVES,
      dryRun: true,
    })

    expect(result.itemsProposed).toBe(1)
    expect(result.itemsArchived).toBe(0)
    expect(writes).toHaveLength(0)
  })

  it("resurrects an archived item and resets last_reaffirmed_at (W2)", async () => {
    const writes: Array<{ sql: string; params: unknown[] | null }> = []
    const provider = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("FROM memory_items") && sql.includes("ORDER BY coalesce")) return []
        // Resurrection match query — must be checked BEFORE the generic
        // FROM observations branch because the CTE references both tables.
        if (sql.includes("WITH new_facts AS")) {
          return [{ memory_item_id: "m-arch", project_id: "p1", observation_id: "obs-new" }]
        }
        if (sql.includes("FROM observations")) return []
        writes.push({ sql, params: params ?? null })
        return []
      }),
    }
    const repos = makeRepos(provider)

    const result = await runHygieneTick(repos, {
      spaceIds: ["s1"],
      halfLifeDays: HALF_LIVES,
      dryRun: false,
    })

    expect(result.itemsResurrected).toBe(1)
    // The resurrect UPDATE must set lifecycle to cooling AND reset the
    // reaffirm clock — otherwise the next tick re-archives the same row.
    const resurrectWrite = writes.find(
      (w) => w.sql.includes("lifecycle_state = 'cooling'") && w.sql.includes("last_reaffirmed_at = now()"),
    )
    expect(resurrectWrite).toBeTruthy()
  })

  it("handles a personal-space item (null project_id) without emitting a 'null' string", async () => {
    const personalItem = { ...STALE_ITEM, project_id: null }
    const { provider } = makeProvider(personalItem)
    const repos = makeRepos(provider)

    let capturedEventParams: unknown[] | null = null
    provider.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM memory_items") && sql.includes("ORDER BY coalesce")) return [personalItem]
      if (sql.includes("FROM observations")) return []
      if (sql.includes("WITH new_facts AS")) return []
      if (sql.includes("INSERT INTO memory_events")) capturedEventParams = params ?? null
      return []
    })

    await runHygieneTick(repos, { spaceIds: ["s1"], halfLifeDays: HALF_LIVES, dryRun: false })

    // First INSERT param is project_id — must be SQL NULL, never the string "null".
    expect(capturedEventParams?.[0]).toBeNull()
  })
})
