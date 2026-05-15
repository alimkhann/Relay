import { describe, expect, it, vi } from "vitest"

import { sources } from "./sources.js"

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    ...overrides,
  } as any
}

describe("sources MCP tool", () => {
  it("routes search action to the explicit source search API", async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ results: [{ sourceId: "source-1", content: "Match" }] }),
    })

    const result = await sources(client, { action: "search", query: "research", limit: 3 }, "project-1")

    expect(client.post).toHaveBeenCalledWith("/api/projects/project-1/sources/search", {
      action: "search",
      query: "research",
      limit: 3,
    })
    expect(result.structuredContent).toEqual({ results: [{ sourceId: "source-1", content: "Match" }] })
  })

  it("routes index action to external source creation", async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ source: { id: "source-1" } }),
    })

    const result = await sources(client, { action: "index", url: "https://example.com/docs" }, "project-1")

    expect(client.post).toHaveBeenCalledWith("/api/projects/project-1/sources/external", {
      action: "index",
      url: "https://example.com/docs",
    })
    expect(result.content[0]!.text).toContain("source-1")
  })
})
