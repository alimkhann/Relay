import { describe, expect, it } from "vitest"

import { hasCompletionSignal, isSameTopic, mergeGovernedList } from "./merge-governed"

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
      ["Deploy migration 0008 to Neon"],
      ["Deploy migration 0009 to Neon"],
      "task"
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toContain("0009")
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

  it("returns true for high token overlap", () => {
    expect(isSameTopic("MCP tool count is 8", "MCP tools should be 8")).toBe(true)
  })

  it("returns false for unrelated topics", () => {
    expect(isSameTopic("Use Postgres for storage", "Deploy to Vercel")).toBe(false)
  })
})
