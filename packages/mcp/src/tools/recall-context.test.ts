import { describe, expect, it, vi } from "vitest"

import { recallContext } from "./recall-context"
import type { RelayClient } from "../client"

function makeClient(response: unknown) {
  const urls: string[] = []
  const client = {
    get: vi.fn(async (url: string) => {
      urls.push(url)
      return response
    }),
  } as unknown as RelayClient
  return { client, urls }
}

describe("recallContext (Memory v2 wiring)", () => {
  it("routes to the space search endpoint and forwards lifecycle + channel params", async () => {
    const { client, urls } = makeClient({
      results: [{ id: "m1", type: "note", title: null, content: "hi", pinned: false, updatedAt: "", rank: 1 }],
      observations: [{ id: "o1", content: "Alim uses Postgres", predicate: "uses" }],
      entities: { entities: [{ id: "e1", name: "Postgres", kind: "tool" }], relations: [] },
    })

    const result = await recallContext(
      client,
      {
        query: "db",
        spaceId: "space-1",
        lifecycleStates: ["active", "archived"],
        includeArchived: true,
        includeObservations: true,
        includeEntities: true,
      },
      "proj-1",
    )

    // Hits the space endpoint, never the project endpoint or dashboard.
    expect(urls.some((u) => u.startsWith("/api/spaces/space-1/memory/search"))).toBe(true)
    expect(urls.some((u) => u.includes("/api/projects/"))).toBe(false)
    const searchUrl = urls.find((u) => u.includes("/memory/search")) ?? ""
    expect(searchUrl).toContain("lifecycle=active%2Carchived")
    expect(searchUrl).toContain("includeArchived=true")
    expect(searchUrl).toContain("observations=true")
    expect(searchUrl).toContain("entities=true")

    const text = result.content[0]?.text ?? ""
    expect(text).toContain("Observations (1)")
    expect(text).toContain("Alim uses Postgres")
    expect(text).toContain("Entities (1)")
  })

  it("uses the project endpoint and fetches project state when no spaceId is given", async () => {
    const { client, urls } = makeClient({ results: [] })

    await recallContext(client, { query: "db" }, "proj-1")

    expect(urls.some((u) => u.startsWith("/api/projects/proj-1/memory/search"))).toBe(true)
    // Project-state snippet is fetched for project scope.
    expect(urls).toContain("/api/projects/proj-1")
  })
})
