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
    for (const action of ["list", "resolve", "index", "status", "read", "search", "context_pack", "explore", "grep", "refresh", "promote", "import", "delete", "purge"]) {
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

  it("routes resolver and retrieval helper actions to explicit lifecycle APIs", async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ tree: [] }),
      post: vi.fn().mockResolvedValue({ ok: true }),
    })

    await sources(client, { action: "resolve", query: "stripe checkout", limit: 5 }, "project-1")
    await sources(client, { action: "context_pack", query: "stripe webhooks", tokenBudget: 4_000 }, "project-1")
    await sources(client, { action: "grep", query: "constructEvent", limit: 5 }, "project-1")
    await sources(client, { action: "explore", sourceId: "22222222-2222-4222-8222-222222222222" }, "project-1")

    expect(client.post).toHaveBeenNthCalledWith(1, "/api/projects/project-1/sources/resolve", {
      query: "stripe checkout",
      url: undefined,
      manifestFileName: undefined,
      manifestContent: undefined,
      registry: undefined,
      limit: 5,
    })
    expect(client.post).toHaveBeenNthCalledWith(2, "/api/projects/project-1/sources/context-pack", {
      query: "stripe webhooks",
      sourceId: undefined,
      limit: undefined,
      tokenBudget: 4_000,
    })
    expect(client.post).toHaveBeenNthCalledWith(3, "/api/projects/project-1/sources/grep", {
      query: "constructEvent",
      sourceId: undefined,
      limit: 5,
    })
    expect(client.get).toHaveBeenCalledWith("/api/projects/project-1/sources/explore?sourceId=22222222-2222-4222-8222-222222222222")
  })

  it("routes import action to external citation import without pretending to call providers", async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ sourceId: "source-1", imported: 1 }),
    })

    await sources(client, {
      action: "import",
      importProvider: "context7",
      providerSourceId: "/websites/stripe",
      displayName: "Stripe Docs",
      citations: [{ title: "Webhooks", url: "https://docs.stripe.com/webhooks", content: "Verify signatures." }],
    }, "project-1")

    expect(client.post).toHaveBeenCalledWith("/api/projects/project-1/sources/import", {
      provider: "context7",
      providerSourceId: "/websites/stripe",
      displayName: "Stripe Docs",
      citations: [{ title: "Webhooks", url: "https://docs.stripe.com/webhooks", content: "Verify signatures." }],
    })
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
