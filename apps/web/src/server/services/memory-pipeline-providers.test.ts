import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

import type { EnrichmentContext } from "@relay/memory-pipeline"

const { runGeminiJsonWithFallback } = vi.hoisted(() => ({
  runGeminiJsonWithFallback: vi.fn(),
}))

vi.mock("./gemini-service", () => ({
  runGeminiJsonWithFallback,
}))

import {
  buildEntityExtractor,
  buildObservationExtractor,
  buildPipelineBudgetGate,
} from "./memory-pipeline-providers"

function ctx(content: string): EnrichmentContext {
  return {
    itemId: "item-1",
    projectId: "project-1",
    type: "note",
    content,
    metadata: {},
  }
}

beforeEach(() => {
  runGeminiJsonWithFallback.mockReset()
})

afterEach(() => {
  delete process.env.RELAY_PIPELINE_DAILY_USD_CAP
})

describe("buildPipelineBudgetGate", () => {
  it("blocks when next call would exceed cap", () => {
    const gate = buildPipelineBudgetGate({ capUsdOverride: 0.001 })
    expect(gate.shouldRun(0.0005)).toBe(true)
    gate.record(0.0005)
    expect(gate.shouldRun(0.0005)).toBe(true) // equal-to-cap permitted
    gate.record(0.0005)
    expect(gate.shouldRun(0.0001)).toBe(false)
  })

  it("snapshot reports spent + reset window", () => {
    const gate = buildPipelineBudgetGate({ capUsdOverride: 1 })
    gate.record(0.25)
    const snap = gate.snapshot()
    expect(snap.capUsd).toBe(1)
    expect(snap.spentUsd).toBeCloseTo(0.25, 6)
    expect(snap.resetAt.getTime()).toBeGreaterThan(Date.now())
  })
})

describe("buildEntityExtractor", () => {
  it("returns canonical entities and records spend", async () => {
    runGeminiJsonWithFallback.mockResolvedValueOnce({
      data: {
        entities: [
          { name: "PostgreSQL", kind: "technology", mention: "postgres" },
          { name: "  ", kind: "technology", mention: "" }, // filtered (blank name)
          { name: "Alim", kind: "person", mention: "Alim" },
        ],
      },
    })
    const gate = buildPipelineBudgetGate({ capUsdOverride: 1 })
    const extractor = buildEntityExtractor(gate)
    const out = await extractor(ctx("Alim runs postgres for relay."))
    expect(out).toEqual([
      { name: "PostgreSQL", kind: "technology", mentionText: "postgres" },
      { name: "Alim", kind: "person", mentionText: "Alim" },
    ])
    expect(gate.snapshot().spentUsd).toBeGreaterThan(0)
  })

  it("returns [] when budget is tripped and never calls gemini", async () => {
    const gate = buildPipelineBudgetGate({ capUsdOverride: 0 })
    const extractor = buildEntityExtractor(gate)
    const out = await extractor(ctx("anything"))
    expect(out).toEqual([])
    expect(runGeminiJsonWithFallback).not.toHaveBeenCalled()
  })

  it("returns [] when gemini throws", async () => {
    runGeminiJsonWithFallback.mockRejectedValueOnce(new Error("boom"))
    const gate = buildPipelineBudgetGate({ capUsdOverride: 1 })
    const extractor = buildEntityExtractor(gate)
    const out = await extractor(ctx("anything"))
    expect(out).toEqual([])
  })
})

describe("buildObservationExtractor", () => {
  it("maps SVO observations correctly", async () => {
    runGeminiJsonWithFallback.mockResolvedValueOnce({
      data: {
        observations: [
          {
            content: "Alim uses PostgreSQL for Relay.",
            confidence: 0.9,
            subject: "Alim",
            predicate: "uses",
            object: "PostgreSQL",
          },
          {
            content: "Relay launch is end of March 2026.",
            confidence: 0.95,
            subject: "Relay",
            predicate: "launch_at",
            objectLiteral: "2026-03-31",
          },
          {
            content: "", // filtered
          },
          {
            content: "non-svo durable note",
            confidence: 1.5, // clamped
          },
        ],
      },
    })
    const gate = buildPipelineBudgetGate({ capUsdOverride: 1 })
    const extractor = buildObservationExtractor(gate)
    const out = await extractor(ctx("Alim runs postgres for relay; launching end of March 2026."))
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual({
      content: "Alim uses PostgreSQL for Relay.",
      confidence: 0.9,
      subjectName: "Alim",
      predicate: "uses",
      objectName: "PostgreSQL",
    })
    expect(out[1]).toEqual({
      content: "Relay launch is end of March 2026.",
      confidence: 0.95,
      subjectName: "Relay",
      predicate: "launch_at",
      objectLiteral: "2026-03-31",
    })
    expect(out[2]).toEqual({
      content: "non-svo durable note",
      confidence: 1, // clamped from 1.5
    })
  })

  it("budget skip returns [] without calling gemini", async () => {
    const gate = buildPipelineBudgetGate({ capUsdOverride: 0 })
    const extractor = buildObservationExtractor(gate)
    expect(await extractor(ctx("anything"))).toEqual([])
    expect(runGeminiJsonWithFallback).not.toHaveBeenCalled()
  })
})
