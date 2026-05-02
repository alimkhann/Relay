import { describe, expect, it } from "vitest"

import type { WorkSessionStructuredState } from "@relay/shared"

import { structuredStateToDigest } from "./work-session-flush-service"

function makeState(overrides: Partial<WorkSessionStructuredState> = {}): WorkSessionStructuredState {
  return {
    summary: "Implemented auth flow",
    progress: "JWT issue-refresh loop done",
    currentObjective: "Ship SSO",
    decisions: ["Use JWT tokens for session"],
    constraints: ["Must support SAML SSO"],
    nextSteps: ["Wire refresh token rotation"],
    relevantTools: ["Claude Code", "neon-postgres"],
    ...overrides,
  }
}

describe("structuredStateToDigest", () => {
  it("maps structured fields onto a SessionDigestShape", () => {
    const digest = structuredStateToDigest(makeState(), null)

    expect(digest.summaryShort).toBe("JWT issue-refresh loop done")
    expect(digest.newDecisions).toEqual(["Use JWT tokens for session"])
    expect(digest.newConstraints).toEqual(["Must support SAML SSO"])
    expect(digest.newTasks).toEqual(["Wire refresh token rotation"])
    expect(digest.relevantToolsDelta).toEqual(["Claude Code", "neon-postgres"])
    expect(digest.currentObjectiveDelta).toBe("Ship SSO")
    expect(digest.recentProgressDelta).toBe("JWT issue-refresh loop done")
    expect(digest.shouldMerge).toBe(true)
  })

  it("prefers explicit summaryShort over fallback chain", () => {
    const digest = structuredStateToDigest(makeState(), "Session checkpoint #3")
    expect(digest.summaryShort).toBe("Session checkpoint #3")
  })

  it("falls back through progress → summary → objective → decision → nextStep", () => {
    expect(
      structuredStateToDigest(
        { progress: null, summary: "summary-a", currentObjective: "objective-a", decisions: ["d"], nextSteps: ["n"] },
        null,
      ).summaryShort,
    ).toBe("summary-a")

    expect(
      structuredStateToDigest(
        { progress: null, summary: null, currentObjective: "objective-a", decisions: ["d1"], nextSteps: ["n1"] },
        null,
      ).summaryShort,
    ).toBe("objective-a")

    expect(
      structuredStateToDigest(
        { progress: null, summary: null, currentObjective: null, decisions: ["d1"], nextSteps: ["n1"] },
        null,
      ).summaryShort,
    ).toBe("d1")

    expect(
      structuredStateToDigest(
        { progress: null, summary: null, currentObjective: null, decisions: [], nextSteps: ["n1"] },
        null,
      ).summaryShort,
    ).toBe("n1")
  })

  it('defaults to "Session checkpoint" when nothing useful is present', () => {
    const digest = structuredStateToDigest({}, null)
    expect(digest.summaryShort).toBe("Session checkpoint")
    expect(digest.newDecisions).toEqual([])
    expect(digest.newConstraints).toEqual([])
    expect(digest.newTasks).toEqual([])
  })

  it("trims and drops empty list entries", () => {
    const digest = structuredStateToDigest(
      {
        summary: "s",
        progress: "p",
        decisions: ["  keep this  ", "", "   ", "another one"],
        constraints: [""],
        nextSteps: ["wire it up"],
      },
      null,
    )
    expect(digest.newDecisions).toEqual(["keep this", "another one"])
    expect(digest.newConstraints).toEqual([])
    expect(digest.newTasks).toEqual(["wire it up"])
  })

  it("caps each list at 24 items", () => {
    const long = Array.from({ length: 30 }, (_, i) => `item-${i}`)
    const digest = structuredStateToDigest({ decisions: long }, null)
    expect(digest.newDecisions).toHaveLength(24)
  })

  it("never mutates the caller's state", () => {
    const state = makeState()
    const snapshot = JSON.stringify(state)
    structuredStateToDigest(state, null)
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})
