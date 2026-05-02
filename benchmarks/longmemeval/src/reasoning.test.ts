import { describe, expect, it } from "vitest"

import { buildBenchmarkEvidenceTable, buildBenchmarkTemporalHint, buildBenchmarkUpdateHint, chooseRetrievalBudget, diversifyChunksForCoverage } from "./reasoning"

describe("benchmark reasoning helpers", () => {
  it("widens retrieval budget for aggregation queries", () => {
    expect(chooseRetrievalBudget("aggregation")).toEqual({ memoryLimit: 44, finalTopK: 24 })
  })

  it("diversifies chunks by session before filling remaining slots", () => {
    const rows = diversifyChunksForCoverage([
      { id: "a", content: "a", session_id: "s1", score: 10, matchType: "semantic" },
      { id: "b", content: "b", session_id: "s1", score: 9, matchType: "semantic" },
      { id: "c", content: "c", session_id: "s2", score: 8, matchType: "summary" },
    ], 2)
    expect(rows.map((row) => row.id)).toEqual(["a", "c"])
  })

  it("renders evidence rows from retrieved chunks", () => {
    const rows = buildBenchmarkEvidenceTable({
      analysis: {
        normalizedQuery: "how many",
        stateIntent: "general",
        reasoningMode: "aggregation",
        historicalAt: null,
        dateRange: undefined,
        asksCountOrTotal: true,
        asksOrder: false,
        asksDuration: false,
      },
      chunks: [{ id: "x", content: "value", session_id: "s1", session_date: "2026-04-13", score: 1, matchType: "canon" }],
      referenceDate: "2026-04-20T00:00:00.000Z",
    })
    expect(rows[0]).toMatchObject({ source: "canon", sessionId: "s1" })
  })

  it("builds temporal and update hints from evidence rows", () => {
    const rows = buildBenchmarkEvidenceTable({
      analysis: {
        normalizedQuery: "what changed",
        stateIntent: "current",
        reasoningMode: "current_state",
        historicalAt: null,
        dateRange: undefined,
        asksCountOrTotal: false,
        asksOrder: false,
        asksDuration: false,
      },
      chunks: [
        { id: "a", content: "[objective current] New value", session_date: "2026-04-20", score: 1, matchType: "canon" },
        { id: "b", content: "[objective previous] Old value", session_date: "2026-04-10", score: 0.9, matchType: "canon" },
      ],
      referenceDate: "2026-04-20T00:00:00.000Z",
    })

    expect(buildBenchmarkTemporalHint(rows).elapsedDays).toBe(10)
    expect(buildBenchmarkUpdateHint(rows).current?.content).toContain("current")
  })
})
