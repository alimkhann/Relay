import { describe, expect, it, vi } from "vitest"

import { sources, sourcesSchema } from "./sources.js"

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as any
}

describe("sources MCP tool", () => {
  it("exposes the same lifecycle action set as hosted Relay sources", () => {
    for (const action of ["list", "index", "status", "read", "search", "refresh", "promote", "delete", "purge"]) {
      expect(() => sourcesSchema.shape.action.parse(action)).not.toThrow()
    }
    expect(() => sourcesSchema.shape.action.parse("discover")).toThrow()
  })

  it("routes search action to the explicit source search API", async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ results: [{ sourceId: "source-1", content: "Match" }] }),
    })

    const result = await sources(client, { action: "search", query: "research", limit: 3 }, "project-1")

    expect(client.post).toHaveBeenCalledWith("/api/projects/project-1/sources/search", {
      query: "research",
      sourceId: undefined,
      limit: 3,
    })
    expect(result.structuredContent).toEqual({ results: [{ sourceId: "source-1", content: "Match" }] })
  })

  it("rejects removed discover/provider routing instead of pretending to use other tools", async () => {
    const client = mockClient()

    await expect(sources(client, { action: "discover", query: "stripe checkout" } as any, "project-1")).rejects.toThrow()
    await expect(sources(client, { action: "search", query: "stripe", provider: "context7" } as any, "project-1")).rejects.toThrow()
    expect(client.post).not.toHaveBeenCalled()
  })

  it("routes index action to external source creation", async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ source: { id: "source-1" } }),
    })

    const result = await sources(client, { action: "index", url: "https://example.com/docs" }, "project-1")

    expect(client.post).toHaveBeenCalledWith("/api/projects/project-1/sources/external", {
      url: "https://example.com/docs",
      displayName: undefined,
      sourceType: undefined,
      refreshPolicy: undefined,
    })
    expect(result.content[0]!.text).toContain("source-1")
  })

  it("routes read action with bounded chunk preview parameters", async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ chunks: [{ id: "11111111-1111-4111-8111-111111111111" }] }),
    })

    await sources(client, {
      action: "read",
      sourceId: "22222222-2222-4222-8222-222222222222",
      chunkId: "11111111-1111-4111-8111-111111111111",
      limit: 1,
    }, "project-1")

    expect(client.get).toHaveBeenCalledWith("/api/projects/project-1/sources/22222222-2222-4222-8222-222222222222?chunkId=11111111-1111-4111-8111-111111111111&limit=1")
  })
})
