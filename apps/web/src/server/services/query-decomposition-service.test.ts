import { describe, expect, it } from "vitest"

import { decomposeQuery } from "./query-decomposition-service"

describe("decomposeQuery", () => {
  it("detects current-state project questions", () => {
    expect(decomposeQuery("what is the current objective and next step?")).toMatchObject({
      stateIntent: "current",
      reasoningMode: "current_state",
      projectStateIntent: true,
      canonKinds: ["objective", "task"],
    })
  })

  it("detects historical intent with explicit date", () => {
    expect(decomposeQuery("what was the architecture decision as of 2026-03-01?")).toMatchObject({
      stateIntent: "historical",
      reasoningMode: "historical_state",
      historicalAt: "2026-03-01T00:00:00.000Z",
      canonKinds: ["decision", "architecture_fact"],
    })
  })

  it("detects aggregation questions", () => {
    expect(decomposeQuery("how many tasks did we complete in total?")).toMatchObject({
      reasoningMode: "aggregation",
      asksCountOrTotal: true,
    })
  })
})
