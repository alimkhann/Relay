import { describe, expect, it } from "vitest"

import type { ProjectRow, ProjectStateRow, SessionDigestShape } from "@relay/shared"

import { mergeDigestIntoState } from "./project-state-service"

function makeProject(): ProjectRow {
  return {
    id: "project-1",
    ownerId: "user-1",
    name: "Relay",
    slug: "relay",
    description: "Keep AI project continuity stable.",
    isArchived: false,
    createdAt: "2026-03-14T00:00:00.000Z",
    updatedAt: "2026-03-14T00:00:00.000Z",
  }
}

function makeState(): ProjectStateRow {
  return {
    projectId: "project-1",
    projectOverview: "Relay keeps project continuity stable.",
    currentObjective: "Ship the extension association flow.",
    stackDomain: null,
    recentProgress: "The chip can insert the current brief.",
    decisions: ["Use Gemini for deep fresh-chat briefs."],
    constraints: ["Do not open the sidepanel automatically."],
    openTasks: ["Fix the association toast for the first saved chat."],
    relevantTools: ["ChatGPT"],
    lastBootstrapAt: null,
    dirty: false,
    createdAt: "2026-03-14T00:00:00.000Z",
    updatedAt: "2026-03-14T00:00:00.000Z",
  }
}

function makeDigest(overrides: Partial<SessionDigestShape>): SessionDigestShape {
  return {
    summaryShort: "Relay updated project state.",
    newDecisions: [],
    newConstraints: [],
    newTasks: [],
    projectOverviewDelta: null,
    currentObjectiveDelta: null,
    recentProgressDelta: null,
    relevantToolsDelta: [],
    importanceScore: 85,
    shouldMerge: true,
    ...overrides,
  }
}

describe("mergeDigestIntoState", () => {
  it("replaces obvious task rephrasings instead of accumulating duplicates", () => {
    const next = mergeDigestIntoState(
      makeProject(),
      makeState(),
      makeDigest({
        newTasks: ["Fix the initial association toast for the first saved chat."],
      })
    )

    expect(next.openTasks).toEqual([
      "Fix the initial association toast for the first saved chat.",
    ])
  })

  it("keeps decisions unless the new digest clearly replaces the old one", () => {
    const next = mergeDigestIntoState(
      makeProject(),
      makeState(),
      makeDigest({
        newDecisions: ["Keep deterministic routing for first-pass association."],
      })
    )

    expect(next.decisions).toEqual([
      "Use Gemini for deep fresh-chat briefs.",
      "Keep deterministic routing for first-pass association.",
    ])
  })

  it("appends constraints in the grey zone instead of auto-merging them", () => {
    // With the 0.85 threshold, "Do not open the sidepanel automatically" and
    // "No longer avoid opening the sidepanel automatically during onboarding"
    // score ~0.75 overlap — in the grey zone. The conservative behavior is to
    // keep both until a future LLM pass resolves them.
    const next = mergeDigestIntoState(
      makeProject(),
      makeState(),
      makeDigest({
        newConstraints: ["No longer avoid opening the sidepanel automatically during onboarding."],
      })
    )

    expect(next.constraints).toEqual([
      "Do not open the sidepanel automatically.",
      "No longer avoid opening the sidepanel automatically during onboarding.",
    ])
  })
})
