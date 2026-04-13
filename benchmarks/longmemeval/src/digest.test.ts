import { describe, expect, it } from "vitest"

import { buildDeterministicDigest } from "./digest"

describe("buildDeterministicDigest", () => {
  it("extracts simple decisions, tasks, and objective candidates from turns", () => {
    const digest = buildDeterministicDigest([
      { role: "user", content: "We decided to use Neon for the project database." },
      { role: "user", content: "We need to ship the benchmark harness update next." },
      { role: "user", content: "I am working on making Relay better for long term project continuity." },
    ])

    expect(digest.newDecisions[0]).toContain("decided to use Neon")
    expect(digest.newTasks[0]).toContain("need to ship")
    expect(digest.currentObjectiveDelta).toContain("working on")
    expect(digest.shouldMerge).toBe(true)
  })
})
