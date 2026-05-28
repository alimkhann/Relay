import { describe, expect, it, vi } from "vitest"

import type { MemoryItemForConflictResolution } from "@relay/shared"

import {
  classifyPersonalSalience,
  decidePersonalCrud,
  PERSONAL_SALIENCE_WRITE_THRESHOLD,
  type PersonalFact,
} from "./personal-memory-service"
import type { runGeminiJsonWithFallback } from "./gemini-service"

const ALLOW_GATE = {
  shouldRun: () => true,
  record: () => {},
  snapshot: () => ({ capUsd: 5, spentUsd: 0, resetAt: new Date() }),
}

// Build a fake runGeminiJsonWithFallback that returns a canned facts payload.
function fakeRunJson(facts: unknown): typeof runGeminiJsonWithFallback {
  return vi.fn(async () => ({
    data: { facts } as never,
    primaryModel: "m",
    actualModel: "m",
    fallbackUsed: false,
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
  })) as unknown as typeof runGeminiJsonWithFallback
}

describe("classifyPersonalSalience", () => {
  it("keeps a durable user-centric fact (e.g. 'I'm vegetarian')", async () => {
    const runJson = fakeRunJson([
      { category: "preference", content: "User is vegetarian", confidence: 0.9 },
    ])
    const facts = await classifyPersonalSalience("I'm vegetarian", { runJson, gate: ALLOW_GATE })
    expect(facts).toEqual<PersonalFact[]>([
      { category: "preference", content: "User is vegetarian", confidence: 0.9 },
    ])
  })

  it("returns [] for transient one-off content (e.g. 'what's 2+2')", async () => {
    // The prompt instructs the model to reject one-off questions → empty facts.
    const runJson = fakeRunJson([])
    const facts = await classifyPersonalSalience("what's 2+2", { runJson, gate: ALLOW_GATE })
    expect(facts).toEqual([])
  })

  it("returns [] for project-technical content (e.g. 'use RRF k=60')", async () => {
    const runJson = fakeRunJson([])
    const facts = await classifyPersonalSalience("use RRF k=60 for fusion", { runJson, gate: ALLOW_GATE })
    expect(facts).toEqual([])
  })

  it("drops rows with unknown category or empty content and clamps confidence", async () => {
    const runJson = fakeRunJson([
      { category: "preference", content: "User likes dark mode", confidence: 1.7 },
      { category: "bogus", content: "User does X", confidence: 0.9 },
      { category: "skill", content: "   ", confidence: 0.9 },
    ])
    const facts = await classifyPersonalSalience("...", { runJson, gate: ALLOW_GATE })
    expect(facts).toEqual<PersonalFact[]>([
      { category: "preference", content: "User likes dark mode", confidence: 1 },
    ])
  })

  it("returns [] without calling the model on empty input", async () => {
    const runJson = fakeRunJson([{ category: "identity", content: "x", confidence: 1 }])
    const facts = await classifyPersonalSalience("   ", { runJson, gate: ALLOW_GATE })
    expect(facts).toEqual([])
    expect(runJson).not.toHaveBeenCalled()
  })

  it("returns [] when the budget gate blocks the call", async () => {
    const runJson = fakeRunJson([{ category: "identity", content: "x", confidence: 1 }])
    const blockGate = { ...ALLOW_GATE, shouldRun: () => false }
    const facts = await classifyPersonalSalience("I'm a developer", { runJson, gate: blockGate })
    expect(facts).toEqual([])
    expect(runJson).not.toHaveBeenCalled()
  })

  it("returns [] (never throws) when the model errors", async () => {
    const runJson = vi.fn(async () => {
      throw new Error("boom")
    }) as unknown as typeof runGeminiJsonWithFallback
    const facts = await classifyPersonalSalience("I'm vegetarian", { runJson, gate: ALLOW_GATE })
    expect(facts).toEqual([])
  })
})

describe("decidePersonalCrud", () => {
  const incoming: MemoryItemForConflictResolution = {
    id: "incoming",
    content: "User is vegetarian",
    capturedAt: new Date().toISOString(),
    type: "note",
  }

  it("adds when there are no existing personal items", () => {
    expect(decidePersonalCrud(incoming, [])).toEqual({ verb: "add" })
  })

  it("adds when no existing item shares the topic", () => {
    const existing: MemoryItemForConflictResolution[] = [
      { id: "e1", content: "User lives in Almaty", capturedAt: null, type: "note" },
    ]
    expect(decidePersonalCrud(incoming, existing)).toEqual({ verb: "add" })
  })

  it("noops when a same-topic existing item outranks the incoming fact", () => {
    const existing: MemoryItemForConflictResolution[] = [
      // Pinned → higher truth score → existing wins → noop.
      { id: "e1", content: "User is vegetarian", capturedAt: null, type: "note", pinned: true },
    ]
    expect(decidePersonalCrud(incoming, existing)).toEqual({ verb: "noop", matchedId: "e1" })
  })

  it("adds (update) when the incoming fact outranks a stale same-topic item", () => {
    const existing: MemoryItemForConflictResolution[] = [
      // Older, not pinned → incoming (fresh capturedAt) wins → add; worker supersedes.
      {
        id: "e1",
        content: "User is vegetarian",
        capturedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        type: "note",
      },
    ]
    expect(decidePersonalCrud(incoming, existing)).toEqual({ verb: "add", matchedId: "e1" })
  })
})

describe("PERSONAL_SALIENCE_WRITE_THRESHOLD", () => {
  it("is a sane soak threshold in (0,1)", () => {
    expect(PERSONAL_SALIENCE_WRITE_THRESHOLD).toBeGreaterThan(0)
    expect(PERSONAL_SALIENCE_WRITE_THRESHOLD).toBeLessThanOrEqual(1)
  })
})
