import { describe, expect, it } from "vitest"

import { analyzeQueryCore } from "./query-analysis"

describe("analyzeQueryCore", () => {
  it("classifies aggregation queries", () => {
    expect(analyzeQueryCore("How many projects have I led in total?")).toMatchObject({
      reasoningMode: "aggregation",
      asksCountOrTotal: true,
    })
  })

  it("classifies temporal arithmetic queries", () => {
    expect(analyzeQueryCore("How many days had passed between the two events?")).toMatchObject({
      reasoningMode: "temporal_arithmetic",
      asksDuration: true,
    })
  })

  it("resolves historicalAt from relative dates when a reference date is provided", () => {
    expect(analyzeQueryCore("What was true 10 days ago?", { referenceDate: "2026-04-20T00:00:00.000Z" }).historicalAt).toBe("2026-04-10T00:00:00.000Z")
  })

  it("classifies current state queries", () => {
    expect(analyzeQueryCore("What is the current objective now?")).toMatchObject({
      reasoningMode: "current_state",
      stateIntent: "current",
    })
  })

  it("extracts quoted entities", () => {
    const result = analyzeQueryCore('What did we decide about "auth middleware"?')
    expect(result.extractedEntities).toContain("auth middleware")
  })

  it("extracts PascalCase identifiers", () => {
    const result = analyzeQueryCore("Where is AuthMiddleware used?")
    expect(result.extractedEntities).toContain("AuthMiddleware")
  })

  it("extracts camelCase identifiers", () => {
    const result = analyzeQueryCore("What does userId refer to?")
    expect(result.extractedEntities).toContain("userId")
  })

  it("detects multi-hop queries", () => {
    expect(analyzeQueryCore("What changed since the auth decision?").isMultiHop).toBe(true)
    expect(analyzeQueryCore("How did the migration affect performance?").isMultiHop).toBe(true)
  })

  it("returns false for simple queries", () => {
    expect(analyzeQueryCore("What is the current objective?").isMultiHop).toBe(false)
  })
})
