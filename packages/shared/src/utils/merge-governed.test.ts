import { describe, expect, it } from "vitest"

import {
  computeMemoryTruthScore,
  deduplicateMemoryItems,
  hasCompletionSignal,
  isSameTopic,
  isLikelySameTopic,
  isSvoConflict,
  mergeGovernedList,
  resolveObservationConflict,
  TOPIC_MATCH_THRESHOLD,
  TOPIC_GREY_ZONE_MIN,
  type ObservationForConflictResolution,
} from "./merge-governed"

describe("mergeGovernedList", () => {
  it("replaces an exact match (case-insensitive) with the incoming version", () => {
    const result = mergeGovernedList(
      ["Use Postgres for storage"],
      ["Use Postgres for storage"],
      "decision"
    )
    expect(result).toEqual(["Use Postgres for storage"])
  })

  it("replaces an existing item when topic overlaps and incoming has a replacement signal", () => {
    const result = mergeGovernedList(
      ["Use Elasticsearch for search"],
      ["Use tsvector instead of Elasticsearch for search"],
      "decision"
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toContain("tsvector")
  })

  it("replaces when negation polarity flips", () => {
    const result = mergeGovernedList(
      ["Do not use SSR for the dashboard"],
      ["Use SSR for the dashboard"],
      "decision"
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toBe("Use SSR for the dashboard")
  })

  it("replaces tasks with same topic unconditionally", () => {
    const result = mergeGovernedList(
      ["Configure Neon database connection pooling for staging environment"],
      ["Configure Neon database connection pooling for production environment"],
      "task"
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toContain("production")
  })

  it("appends non-overlapping items", () => {
    const result = mergeGovernedList(
      ["Use Postgres for storage"],
      ["Deploy to Vercel"],
      "decision"
    )
    expect(result).toEqual(["Use Postgres for storage", "Deploy to Vercel"])
  })

  it("deduplicates within incoming items when existing is empty", () => {
    const result = mergeGovernedList(
      [],
      ["Set up auth", "Set up auth"],
      "task"
    )
    expect(result).toEqual(["Set up auth"])
  })
})

describe("hasCompletionSignal", () => {
  it("detects completed", () => {
    expect(hasCompletionSignal("Migration 0008 completed successfully")).toBe(true)
  })

  it("detects shipped", () => {
    expect(hasCompletionSignal("Memory search feature shipped")).toBe(true)
  })

  it("detects deployed", () => {
    expect(hasCompletionSignal("Deployed the new MCP tools")).toBe(true)
  })

  it("detects merged", () => {
    expect(hasCompletionSignal("PR merged into main")).toBe(true)
  })

  it("returns false for non-completion text", () => {
    expect(hasCompletionSignal("Working on the migration")).toBe(false)
  })
})

describe("isSameTopic", () => {
  it("returns true when one string contains the other", () => {
    expect(isSameTopic("Use Postgres", "Use Postgres for the database layer")).toBe(true)
  })

  it("returns true for high token overlap above threshold", () => {
    // Tokens: "configur", "neon", "databas", "connect", "pool" — 4/5 overlap
    // Actually uses substring match since one contains the other
    expect(isSameTopic(
      "Configure Neon database connection pooling",
      "Configure the Neon database connection pooling settings"
    )).toBe(true)
  })

  it("returns false for moderate overlap below threshold", () => {
    // ~67% overlap — below 0.85 threshold, should NOT merge
    expect(isSameTopic("MCP tool count is 8", "MCP tools should be 8")).toBe(false)
  })

  it("returns false for unrelated topics", () => {
    expect(isSameTopic("Use Postgres for storage", "Deploy to Vercel")).toBe(false)
  })
})

describe("isLikelySameTopic", () => {
  it("returns true for items in the grey zone (0.6–0.85)", () => {
    // ~67% overlap — in the grey zone
    expect(isLikelySameTopic("MCP tool count is 8", "MCP tools should be 8")).toBe(true)
  })

  it("returns false for items above the match threshold", () => {
    expect(isLikelySameTopic("Use Postgres", "Use Postgres for the database layer")).toBe(false)
  })

  it("returns false for unrelated items below grey zone", () => {
    expect(isLikelySameTopic("Use Postgres for storage", "Deploy to Vercel")).toBe(false)
  })
})

describe("thresholds", () => {
  it("TOPIC_MATCH_THRESHOLD is 0.85", () => {
    expect(TOPIC_MATCH_THRESHOLD).toBe(0.85)
  })

  it("TOPIC_GREY_ZONE_MIN is 0.6", () => {
    expect(TOPIC_GREY_ZONE_MIN).toBe(0.6)
  })
})

describe("truth-weighted memory conflict resolution", () => {
  it("prefers a validated foundational item over a merely newer inferred item", () => {
    const items = deduplicateMemoryItems([
      {
        id: "older-foundational",
        type: "decision",
        content: "Use Postgres for the primary database",
        capturedAt: "2026-03-01T00:00:00.000Z",
        metadata: {
          authority: "validated_state",
          durability: "foundational",
          validationState: "validated",
        },
      },
      {
        id: "newer-inferred",
        type: "decision",
        content: "Use Postgres for the database",
        capturedAt: "2026-03-10T00:00:00.000Z",
        metadata: {
          authority: "work_session",
          durability: "working",
          validationState: "inferred",
        },
      },
    ])

    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe("older-foundational")
  })

  it("gives pinned items a strong truth score boost", () => {
    const pinned = computeMemoryTruthScore({
      id: "pinned",
      type: "constraint",
      content: "Do not introduce third-party auth providers",
      capturedAt: "2026-03-01T00:00:00.000Z",
      pinned: true,
      metadata: {},
    })

    const plain = computeMemoryTruthScore({
      id: "plain",
      type: "constraint",
      content: "Do not introduce third-party auth providers",
      capturedAt: "2026-03-01T00:00:00.000Z",
      metadata: {},
    })

    expect(pinned).toBeGreaterThan(plain)
  })
})

describe("isSvoConflict", () => {
  function obs(overrides: Partial<ObservationForConflictResolution> = {}): ObservationForConflictResolution {
    return {
      id: "o1",
      content: "Alim works at Relay",
      capturedAt: "2026-01-01T00:00:00.000Z",
      type: "observation",
      subjectEntityId: "e-alim",
      predicate: "works_at",
      objectEntityId: "e-relay",
      objectLiteral: null,
      ...overrides,
    }
  }

  it("flags same subject+predicate with a different object entity", () => {
    expect(isSvoConflict(obs(), obs({ id: "o2", objectEntityId: "e-acme" }))).toBe(true)
  })

  it("treats the predicate match as case-insensitive", () => {
    expect(
      isSvoConflict(obs({ predicate: "Works_At" }), obs({ id: "o2", predicate: "works_at", objectEntityId: "e-acme" })),
    ).toBe(true)
  })

  it("is not a conflict when the object is identical", () => {
    expect(isSvoConflict(obs(), obs({ id: "o2" }))).toBe(false)
  })

  it("is not a conflict when subject differs", () => {
    expect(isSvoConflict(obs(), obs({ id: "o2", subjectEntityId: "e-other", objectEntityId: "e-acme" }))).toBe(false)
  })

  it("is not a conflict when either side lacks subject or predicate", () => {
    expect(isSvoConflict(obs({ predicate: null }), obs({ id: "o2", objectEntityId: "e-acme" }))).toBe(false)
    expect(isSvoConflict(obs(), obs({ id: "o2", subjectEntityId: null, objectEntityId: "e-acme" }))).toBe(false)
  })

  it("compares object literals case-insensitively when no object entity", () => {
    const a = obs({ objectEntityId: null, objectLiteral: "Remote" })
    const b = obs({ id: "o2", objectEntityId: null, objectLiteral: "remote" })
    expect(isSvoConflict(a, b)).toBe(false)
  })
})

describe("resolveObservationConflict", () => {
  function obs(overrides: Partial<ObservationForConflictResolution> = {}): ObservationForConflictResolution {
    return {
      id: "o1",
      content: "Alim works at Relay",
      capturedAt: "2026-01-01T00:00:00.000Z",
      type: "observation",
      subjectEntityId: "e-alim",
      predicate: "works_at",
      objectEntityId: "e-relay",
      objectLiteral: null,
      metadata: {},
      ...overrides,
    }
  }

  it("on an SVO conflict, the higher-truth observation wins", () => {
    const existing = obs()
    const incoming = obs({
      id: "o2",
      objectEntityId: "e-acme",
      metadata: { authority: "human_explicit" },
    })
    expect(resolveObservationConflict(existing, incoming)?.id).toBe("o2")
  })

  it("on an SVO conflict tie, the newer observation wins", () => {
    const existing = obs({ capturedAt: "2026-01-01T00:00:00.000Z" })
    const incoming = obs({ id: "o2", objectEntityId: "e-acme", capturedAt: "2026-02-01T00:00:00.000Z" })
    expect(resolveObservationConflict(existing, incoming)?.id).toBe("o2")
  })
})
