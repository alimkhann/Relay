import { describe, expect, it } from "vitest"

import type { DatabaseProvider, DatabaseRow } from "../store/provider"
import { SourceRepository } from "./source-repository"

interface CapturedCall {
  text: string
  values: unknown[]
}

function makeFakeProvider(responseRows: DatabaseRow[] = []): {
  provider: DatabaseProvider
  calls: CapturedCall[]
} {
  const calls: CapturedCall[] = []
  const provider: DatabaseProvider = {
    mode: "local",
    async query<T extends DatabaseRow = DatabaseRow>(text: string, values: unknown[] = []): Promise<T[]> {
      calls.push({ text, values })
      return responseRows as T[]
    },
    async transaction<T>(callback: (provider: DatabaseProvider) => Promise<T>): Promise<T> {
      return callback(provider)
    },
  }
  return { provider, calls }
}

describe("SourceRepository external source helpers", () => {
  it("finds active sources by canonical source URI", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new SourceRepository(provider)

    await repo.findBySourceUri("project-1", "https://example.com/docs")

    expect(calls[0]!.text).toContain("source_uri = $2")
    expect(calls[0]!.text).toContain("status <> 'archived'")
    expect(calls[0]!.values).toEqual(["project-1", "https://example.com/docs"])
  })

  it("searches ready source chunks with websearch_to_tsquery and optional kind filters", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new SourceRepository(provider)

    await repo.searchChunks("project-1", {
      query: "attention mechanisms",
      kinds: ["external_docs"],
      limit: 7,
    })

    const sql = calls[0]!.text
    expect(sql).toContain("websearch_to_tsquery")
    expect(sql).toContain("s.kind = ANY")
    expect(sql).toContain("s.status = 'ready'")
    expect(calls[0]!.values).toContain("attention mechanisms")
    expect(calls[0]!.values).toContainEqual(["external_docs"])
    expect(calls[0]!.values).toContain(7)
  })

  it("counts external sources separately from uploaded files", async () => {
    const { provider, calls } = makeFakeProvider([{ count: 3 }])
    const repo = new SourceRepository(provider)

    await expect(repo.countExternalByProject("project-1")).resolves.toBe(3)
    expect(calls[0]!.text).toContain("kind in ('external_docs', 'package_docs')")
  })
})
