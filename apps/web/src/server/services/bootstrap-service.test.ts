import { describe, expect, it } from "vitest"

import { shouldDeferBootstrapGeneration } from "./bootstrap-service"

describe("shouldDeferBootstrapGeneration", () => {
  it("blocks bootstraps when neither digests nor project state exist", () => {
    expect(shouldDeferBootstrapGeneration(null, [])).toBe(true)
  })

  it("allows bootstraps once a digest exists even before project state is merged", () => {
    expect(
      shouldDeferBootstrapGeneration(null, [
        {
          id: "digest-1",
          projectId: "project-1",
          sourceSessionId: "session-1",
          sourceSignature: "sig",
          summaryShort: "Relay captured a durable project update.",
          structuredDigest: {},
          confidence: 0.8,
          importanceScore: 78,
          needsProjectStateMerge: true,
          mergedAt: null,
          createdBy: "user-1",
          createdAt: "2026-03-11T00:00:00.000Z"
        }
      ])
    ).toBe(false)
  })
})
