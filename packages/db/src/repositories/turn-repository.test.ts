import { describe, expect, it } from "vitest"

import type { DatabaseProvider, DatabaseRow } from "../store/provider"
import { TurnRepository } from "./turn-repository"

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

describe("TurnRepository.countBySessionIds", () => {
  it("counts turns without selecting turn content or raw html", async () => {
    const { provider, calls } = makeFakeProvider([
      { session_id: "session-1", turn_count: 3 },
      { session_id: "session-2", turn_count: 0 },
    ])
    const repo = new TurnRepository(provider)

    const counts = await repo.countBySessionIds(["session-1", "session-2"])

    expect(counts).toEqual(new Map([
      ["session-1", 3],
      ["session-2", 0],
    ]))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.text).toContain("count(*)")
    expect(calls[0]!.text).not.toContain("content")
    expect(calls[0]!.text).not.toContain("raw_html")
    expect(calls[0]!.values).toEqual([["session-1", "session-2"]])
  })
})

describe("TurnRepository.listBySession", () => {
  it("loads turn text without fetching raw html", async () => {
    const { provider, calls } = makeFakeProvider([])
    const repo = new TurnRepository(provider)

    await repo.listBySession("session-1")

    expect(calls[0]!.text).toContain("content")
    expect(calls[0]!.text).not.toContain("raw_html")
  })
})
