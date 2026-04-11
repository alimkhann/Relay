import { describe, expect, it } from "vitest"

import { decomposeBulletWithTraceability, extractAtomicFacts } from "./fact-extractor"

describe("extractAtomicFacts", () => {
  it("returns empty array on empty input", () => {
    expect(extractAtomicFacts("")).toEqual([])
    expect(extractAtomicFacts("   ")).toEqual([])
  })

  it("returns a single fact when input is atomic", () => {
    expect(extractAtomicFacts("use Postgres for production database")).toEqual([
      "use Postgres for production database",
    ])
  })

  it("strips trailing period on a single-fact normalize", () => {
    expect(extractAtomicFacts("use Postgres for production.")).toEqual([
      "use Postgres for production",
    ])
  })

  it("splits on sentence boundary with capitalized follower", () => {
    const facts = extractAtomicFacts(
      "Use Postgres for production database. Mongo is the analytics sandbox store.",
    )
    expect(facts).toEqual([
      "Use Postgres for production database",
      "Mongo is the analytics sandbox store",
    ])
  })

  it("splits on semicolons", () => {
    const facts = extractAtomicFacts(
      "adopt TypeScript in every package; enforce strict null checks across the repo",
    )
    expect(facts).toHaveLength(2)
    expect(facts[0]).toContain("TypeScript")
    expect(facts[1]).toContain("strict null")
  })

  it("splits on ' and then ' connector", () => {
    const facts = extractAtomicFacts(
      "Provision a dev Neon branch and then point the migration runner at it",
    )
    expect(facts).toHaveLength(2)
  })

  it("collapses parts under the minimum word threshold back into the whole", () => {
    // Each fragment is <4 words, so the splitter rejects all and returns the normalized whole.
    const facts = extractAtomicFacts("use pg; use mongo; ok")
    expect(facts).toEqual(["use pg; use mongo; ok".replace(/\.+$/, "")])
  })

  it("caps at MAX_FACTS_PER_BULLET (6)", () => {
    const long =
      "Step one must happen early today. Step two must happen later today. " +
      "Step three is the main workhorse. Step four cleans up leftovers. " +
      "Step five notifies every downstream consumer. Step six closes the session out. " +
      "Step seven is ignored because we cap at six. Step eight is also ignored."
    const facts = extractAtomicFacts(long)
    expect(facts.length).toBeLessThanOrEqual(6)
    expect(facts.length).toBe(6)
  })

  it("deduplicates case-insensitively", () => {
    const facts = extractAtomicFacts(
      "use Postgres for production database. Use Postgres for production database. Mongo is the analytics sandbox store.",
    )
    // Two unique facts despite three parts.
    expect(facts).toHaveLength(2)
  })
})

describe("decomposeBulletWithTraceability", () => {
  it("returns empty atoms array when input is a single fact", () => {
    const result = decomposeBulletWithTraceability("use Postgres for production database")
    expect(result.parent).toBe("use Postgres for production database")
    expect(result.atoms).toEqual([])
  })

  it("returns parent + atoms when bullet decomposes into multiple facts", () => {
    const result = decomposeBulletWithTraceability(
      "Use Postgres for production database. Mongo is the analytics sandbox store.",
    )
    expect(result.parent).toContain("Postgres")
    expect(result.atoms).toHaveLength(2)
    expect(result.atoms[0]).toContain("Postgres")
    expect(result.atoms[1]).toContain("Mongo")
  })
})
