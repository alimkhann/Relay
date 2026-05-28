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
  it("forwards lifecycle + channel params to the project search endpoint", async () => {
    const { client, urls } = makeClient({
      results: [{ id: "m1", type: "note", title: null, content: "hi", pinned: false, updatedAt: "", rank: 1 }],
      observations: [{ id: "o1", content: "Alim uses Postgres", predicate: "uses" }],
      entities: {
        entities: [
          { id: "e1", name: "Alim", kind: "person" },
          { id: "e2", name: "Postgres", kind: "tool" },
        ],
        relations: [
          { sourceEntityId: "e1", targetEntityId: "e2", relationType: "uses", confidence: 1 },
        ],
      },
    })

    const result = await recallContext(
      client,
      {
        query: "db",
        lifecycleStates: ["active", "archived"],
        includeArchived: true,
        includeObservations: true,
        includeEntities: true,
      },
      "proj-1",
    )

    // Hits the project search endpoint.
    expect(urls.some((u) => u.startsWith("/api/projects/proj-1/memory/search"))).toBe(true)
    const searchUrl = urls.find((u) => u.includes("/memory/search")) ?? ""
    expect(searchUrl).toContain("lifecycle=active%2Carchived")
    expect(searchUrl).toContain("includeArchived=true")
    expect(searchUrl).toContain("observations=true")
    expect(searchUrl).toContain("entities=true")

    const text = result.content[0]?.text ?? ""
    expect(text).toContain("Observations (1)")
    expect(text).toContain("Alim uses Postgres")
    expect(text).toContain("Entities (2)")
    // Relation line uses entity names, not raw UUIDs.
    expect(text).toContain("Alim —[uses]→ Postgres")
    expect(text).not.toContain("e1 —[uses]→ e2")
  })

  it("uses the project endpoint and fetches project state", async () => {
    const { client, urls } = makeClient({ results: [] })

    await recallContext(client, { query: "db" }, "proj-1")

    expect(urls.some((u) => u.startsWith("/api/projects/proj-1/memory/search"))).toBe(true)
    // Project-state snippet is fetched for project scope.
    expect(urls).toContain("/api/projects/proj-1")
  })
})
