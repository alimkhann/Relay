import { describe, expect, it } from "vitest"

import { analyzeBenchmarkQuery } from "./query"

describe("analyzeBenchmarkQuery", () => {
  it("detects historical queries", () => {
    expect(analyzeBenchmarkQuery("What was true as of 2026-03-01?")).toMatchObject({
      stateIntent: "historical",
      reasoningMode: "historical_state",
      historicalAt: "2026-03-01T00:00:00.000Z",
    })
  })

  it("detects current queries", () => {
    expect(analyzeBenchmarkQuery("What is the current status now?")).toMatchObject({
      stateIntent: "current",
      reasoningMode: "current_state",
    })
  })

  it("uses question date for relative temporal phrases", () => {
    expect(analyzeBenchmarkQuery("What happened 10 days ago?", { referenceDate: "2026-04-20T00:00:00.000Z" }).historicalAt).toBe("2026-04-10T00:00:00.000Z")
  })
})
