import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  evaluateSourceRetrievalBenchmark,
  getOptionalBaselineStatus,
  parseSourceRetrievalGoldJsonl,
} from "./source-benchmark"

describe("source retrieval benchmark harness", () => {
  it("loads JSONL gold cases for free deterministic Relay-native evaluation", () => {
    const fixturePath = path.join(process.cwd(), "tests/fixtures/source-retrieval-gold.jsonl")
    const cases = parseSourceRetrievalGoldJsonl(readFileSync(fixturePath, "utf8"))

    expect(cases.length).toBeGreaterThanOrEqual(5)
    expect(cases[0]).toMatchObject({
      id: expect.any(String),
      query: expect.any(String),
      expectedOfficialDomains: expect.any(Array),
      requiredConcepts: expect.any(Array),
    })
  })

  it("scores official source resolution, citation recall, concepts, duplicates, stale hits, and token use", () => {
    const cases = [
      {
        id: "stripe-next-checkout-webhooks",
        query: "integrate Stripe Checkout and webhooks in Next.js",
        expectedOfficialDomains: ["docs.stripe.com", "nextjs.org"],
        requiredConcepts: ["Checkout Session", "webhook", "signature"],
        forbiddenTerms: ["pages/api"],
      },
      {
        id: "next-cache",
        query: "Next.js App Router caching",
        expectedOfficialDomains: ["nextjs.org"],
        requiredConcepts: ["fetch", "revalidate"],
        forbiddenTerms: ["getStaticProps"],
      },
    ]

    const report = evaluateSourceRetrievalBenchmark(cases, [
      {
        caseId: "stripe-next-checkout-webhooks",
        latencyMs: 120,
        tokenBudget: 1_000,
        tokenEstimate: 400,
        hits: [
          { url: "https://docs.stripe.com/checkout/quickstart", content: "Create a Checkout Session." },
          { url: "https://docs.stripe.com/webhooks", content: "Verify webhook signature." },
        ],
      },
      {
        caseId: "next-cache",
        latencyMs: 80,
        tokenBudget: 1_000,
        tokenEstimate: 250,
        hits: [
          { url: "https://nextjs.org/docs/app/building-your-application/caching", content: "fetch can revalidate cached data." },
          { url: "https://nextjs.org/docs/app/building-your-application/caching", content: "duplicate" },
          { url: "https://blog.example.com/next-cache", content: "getStaticProps", officialClaim: true, stale: true },
        ],
      },
    ])

    expect(report.sourceResolutionTop1).toBe(1)
    expect(report.citationRecallAt5).toBe(1)
    expect(report.requiredConceptCoverage).toBe(1)
    expect(report.duplicateRate).toBeGreaterThan(0)
    expect(report.falseOfficialClaims).toBe(1)
    expect(report.staleCitationRate).toBeGreaterThan(0)
    expect(report.averageLatencyMs).toBe(100)
    expect(report.averageTokenBudgetUse).toBe(0.325)
  })

  it("marks optional Context7 and Nia baselines as skipped unless explicitly enabled", () => {
    expect(getOptionalBaselineStatus({})).toEqual({ context7: "skipped", nia: "skipped" })
    expect(getOptionalBaselineStatus({ CONTEXT7_BENCHMARK: "1", NIA_BENCHMARK: "1" })).toEqual({
      context7: "available",
      nia: "available",
    })
  })
})
