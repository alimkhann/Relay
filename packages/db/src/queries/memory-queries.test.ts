import { describe, expect, it } from "vitest"

import { getRankedMemory } from "./memory-queries"
import { createRepositoryBundle } from "./repository-bundle"

describe("getRankedMemory", () => {
  it("prioritizes pinned decisions before other memory", async () => {
    const repositories = createRepositoryBundle()

    const items = await getRankedMemory(repositories, "project-relay-mvp")

    expect(items[0]?.type).toBe("decision")
    expect(items[1]?.type).toBe("constraint")
  })
})
