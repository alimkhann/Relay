import { describe, expect, it } from "vitest"

import {
  personalCategoryFromMetadata,
  resolvePersonalCategory,
  sortPersonalCategoriesByFill,
} from "./memory-taxonomy"

describe("resolvePersonalCategory", () => {
  it("returns the stored category when valid", () => {
    expect(resolvePersonalCategory({ personalCategory: "person" })).toBe("person")
    expect(resolvePersonalCategory({ personalCategory: "concept" })).toBe("concept")
  })

  it("falls back to 'note' for missing/invalid categories so items are never dropped", () => {
    expect(resolvePersonalCategory(null)).toBe("note")
    expect(resolvePersonalCategory(undefined)).toBe("note")
    expect(resolvePersonalCategory({})).toBe("note")
    expect(resolvePersonalCategory({ personalCategory: "bogus" })).toBe("note")
    // An agent/MCP write that set only the type enum has no personalCategory.
    expect(resolvePersonalCategory({ source: "mcp", durability: "working" })).toBe("note")
  })

  it("differs from personalCategoryFromMetadata, which stays nullable", () => {
    expect(personalCategoryFromMetadata({})).toBeNull()
    expect(resolvePersonalCategory({})).toBe("note")
  })
})

describe("sortPersonalCategoriesByFill", () => {
  it("counts uncategorized items toward the note bucket", () => {
    const ordered = sortPersonalCategoriesByFill([
      { metadata: {}, capturedAt: "2026-06-01T00:00:00Z" },
      { metadata: { personalCategory: "bogus" }, capturedAt: "2026-06-02T00:00:00Z" },
      { metadata: { personalCategory: "person" }, capturedAt: "2026-06-03T00:00:00Z" },
    ])
    // note has 2 items, person has 1 → note sorts ahead of person.
    expect(ordered.indexOf("note")).toBeLessThan(ordered.indexOf("person"))
  })
})
