import { afterEach, describe, expect, it, vi } from "vitest"

import type { MemoryItemForConflictResolution } from "@relay/shared"

const getPersonalProjectMock = vi.fn()
const listByProjectMock = vi.fn()
const createMemoryItemMock = vi.fn()

vi.mock("@relay/db", () => ({
  createRepositoryBundle: () => ({
    projects: { getPersonalProject: getPersonalProjectMock },
    memory: { listByProject: listByProjectMock },
  }),
}))

vi.mock("./memory-service", () => ({
  createMemoryItem: (...args: unknown[]) => createMemoryItemMock(...args),
}))

import {
  classifyPersonalSalience,
  decidePersonalCrud,
  routePersonalMemory,
  PERSONAL_SALIENCE_WRITE_THRESHOLD,
  PERSONAL_SALIENCE_UNSURE_THRESHOLD,
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

  it("unsure threshold sits below the write threshold", () => {
    expect(PERSONAL_SALIENCE_UNSURE_THRESHOLD).toBeGreaterThan(0)
    expect(PERSONAL_SALIENCE_UNSURE_THRESHOLD).toBeLessThan(PERSONAL_SALIENCE_WRITE_THRESHOLD)
  })
})

describe("routePersonalMemory result", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    getPersonalProjectMock.mockReset()
    listByProjectMock.mockReset()
    createMemoryItemMock.mockReset()
  })

  function classifyWith(facts: PersonalFact[]) {
    return {
      runJson: fakeRunJson(facts),
      gate: ALLOW_GATE as never,
    }
  }

  it("returns empty result when the user has no personal project", async () => {
    getPersonalProjectMock.mockResolvedValue(null)
    const result = await routePersonalMemory("u1", "proj-1", "hi", {
      classifyDeps: classifyWith([{ category: "identity", content: "x", confidence: 0.9 }]),
    })
    expect(result).toEqual({ personalProjectId: null, written: 0, unsure: 0, duplicate: 0 })
  })

  it("skips re-routing when the active project already is personal", async () => {
    getPersonalProjectMock.mockResolvedValue({ id: "personal-1" })
    const result = await routePersonalMemory("u1", "personal-1", "hi", {
      classifyDeps: classifyWith([{ category: "identity", content: "x", confidence: 0.9 }]),
    })
    expect(result).toEqual({ personalProjectId: "personal-1", written: 0, unsure: 0, duplicate: 0 })
  })

  it("counts borderline facts as unsure during soak (autowrite off)", async () => {
    vi.stubEnv("RELAY_PERSONAL_MEMORY_AUTOWRITE", "")
    getPersonalProjectMock.mockResolvedValue({ id: "personal-1" })
    listByProjectMock.mockResolvedValue([])
    const result = await routePersonalMemory("u1", "proj-1", "hi", {
      classifyDeps: classifyWith([
        { category: "preference", content: "likes dark mode", confidence: 0.55 },
        { category: "goal", content: "noise", confidence: 0.2 },
      ]),
    })
    expect(result.written).toBe(0)
    expect(result.unsure).toBe(1)
    expect(createMemoryItemMock).not.toHaveBeenCalled()
  })

  it("writes high-confidence facts when autowrite is enabled", async () => {
    vi.stubEnv("RELAY_PERSONAL_MEMORY_AUTOWRITE", "true")
    getPersonalProjectMock.mockResolvedValue({ id: "personal-1" })
    listByProjectMock.mockResolvedValue([])
    createMemoryItemMock.mockImplementation(async (_u: string, input: { content: string }) => ({
      id: `m-${input.content}`,
      content: input.content,
      capturedAt: new Date().toISOString(),
      type: "note",
      pinned: false,
      sourceSurface: "auto",
      metadata: {},
    }))
    const result = await routePersonalMemory("u1", "proj-1", "hi", {
      classifyDeps: classifyWith([
        { category: "identity", content: "based in Kazakhstan", confidence: 0.92 },
      ]),
    })
    expect(result.written).toBe(1)
    expect(result.unsure).toBe(0)
    expect(createMemoryItemMock).toHaveBeenCalledOnce()
  })
})
