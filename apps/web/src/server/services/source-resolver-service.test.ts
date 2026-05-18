import { beforeEach, describe, expect, it, vi } from "vitest"

const { createRepositoryBundleMock } = vi.hoisted(() => ({
  createRepositoryBundleMock: vi.fn(),
}))

vi.mock("@relay/db", () => ({
  createRepositoryBundle: createRepositoryBundleMock,
}))

import { resolveProjectSources } from "./source-resolver-service"

describe("source-resolver-service", () => {
  beforeEach(() => {
    createRepositoryBundleMock.mockReset()
  })

  it("resolves existing project sources and explicit URLs without hardcoded candidates", async () => {
    createRepositoryBundleMock.mockReturnValue({
      sources: {
        listByProject: vi.fn().mockResolvedValue([
          {
            id: "source-1",
            displayName: "Stripe Docs",
            sourceUri: "https://docs.stripe.com",
            kind: "external_docs",
            metadata: { external: { sourceType: "website" } },
          },
        ]),
        searchGlobalSources: vi.fn().mockResolvedValue([]),
      },
    })

    const result = await resolveProjectSources("user-1", "project-1", {
      query: "stripe checkout",
      url: "https://example.com/docs",
      limit: 5,
    })

    expect(result.candidates.map((candidate) => candidate.url)).toEqual([
      "https://docs.stripe.com",
      "https://example.com/docs",
    ])
    expect(result.candidates[0]!.evidence[0]).toMatchObject({ type: "project_source", value: "source-1" })
    expect(result.candidates[1]!.evidence[0]).toMatchObject({ type: "explicit_url" })
  })

  it("uses package registry metadata from a manifest as evidence instead of guessing docs URLs", async () => {
    createRepositoryBundleMock.mockReturnValue({
      sources: {
        listByProject: vi.fn().mockResolvedValue([]),
        searchGlobalSources: vi.fn().mockResolvedValue([]),
      },
    })

    const fetcher = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("https://registry.npmjs.org/stripe/latest")
      return new Response(JSON.stringify({
        name: "stripe",
        homepage: "https://github.com/stripe/stripe-node",
        repository: { url: "git+https://github.com/stripe/stripe-node.git" },
      }), { headers: { "content-type": "application/json" } })
    })

    const result = await resolveProjectSources("user-1", "project-1", {
      query: "stripe",
      manifestFileName: "package.json",
      manifestContent: JSON.stringify({ dependencies: { stripe: "^19.0.0" } }),
      limit: 5,
    }, { fetcher })

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.candidates[0]).toMatchObject({
      title: "stripe",
      url: "https://github.com/stripe/stripe-node",
      sourceType: "github_repo",
    })
    expect(result.candidates[0]!.evidence).toContainEqual(expect.objectContaining({ type: "package_registry", value: "npm:stripe" }))
    expect(result.unresolved).toEqual([])
  })

  it("returns unresolved package names and external-tool guidance when no evidence exists", async () => {
    createRepositoryBundleMock.mockReturnValue({
      sources: {
        listByProject: vi.fn().mockResolvedValue([]),
        searchGlobalSources: vi.fn().mockResolvedValue([]),
      },
    })

    const result = await resolveProjectSources("user-1", "project-1", {
      query: "unknown-lib",
      manifestFileName: "package.json",
      manifestContent: JSON.stringify({ dependencies: { "unknown-lib": "^1.0.0" } }),
      limit: 5,
    }, {
      fetcher: async () => new Response("{}", { headers: { "content-type": "application/json" } }),
    })

    expect(result.candidates).toEqual([])
    expect(result.unresolved).toEqual(["unknown-lib"])
    expect(result.guidance).toContain("Context7")
    expect(result.guidance).toContain("Nia")
  })
})
