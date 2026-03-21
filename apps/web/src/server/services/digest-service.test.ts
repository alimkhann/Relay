import { describe, expect, it } from "vitest"

import type { ProjectStateRow, SourceSessionRow, SourceTurnRow } from "@relay/shared"
import { hashContent } from "@relay/shared"

import { deterministicDigest, prepareDigestTurns, sanitizeDigest } from "./digest-service"

function makeSession(): SourceSessionRow {
  return {
    id: "session-1",
    projectId: "project-1",
    platform: "chatgpt",
    title: "Relay planning",
    url: "https://chatgpt.com/c/test",
    sourceConversationId: "test",
    tabId: null,
    windowId: null,
    pageFingerprint: "test",
    captureSignature: "sig",
    metadata: {},
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    capturedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  }
}

function makeTurn(turnIndex: number, role: SourceTurnRow["role"], content: string): SourceTurnRow {
  return {
    id: `turn-${turnIndex}`,
    sessionId: "session-1",
    role,
    content,
    contentHash: hashContent(content),
    rawHtml: null,
    metadata: {},
    turnIndex,
    createdAt: new Date().toISOString()
  }
}

function makeState(): ProjectStateRow {
  const now = new Date().toISOString()
  return {
    projectId: "project-1",
    projectOverview: "Relay keeps project state alive across AI chats.",
    currentObjective: "Build fresh-chat bootstrap flow for Relay.",
    stackDomain: null,
    recentProgress: null,
    decisions: [],
    constraints: [],
    openTasks: [],
    relevantTools: [],
    objectiveHistory: [],
    lastBootstrapAt: null,
    dirty: false,
    createdAt: now,
    updatedAt: now
  }
}

describe("prepareDigestTurns", () => {
  it("drops unknown transcript wrappers and deduplicates repeated content", () => {
    const turns = [
      makeTurn(0, "user", "Build Relay MVP."),
      makeTurn(1, "unknown", "You said: Build Relay MVP."),
      makeTurn(2, "assistant", "Use a browser extension."),
      makeTurn(3, "assistant", "Use a browser extension.")
    ]

    const cleaned = prepareDigestTurns(turns)

    expect(cleaned).toHaveLength(2)
    expect(cleaned.map((turn) => turn.role)).toEqual(["user", "assistant"])
    expect(cleaned[0]?.content).toBe("Build Relay MVP.")
  })
})

describe("deterministicDigest", () => {
  it("never sets objective or tasks from raw turns (safe fallback)", () => {
    const state = makeState()
    const turns = [
      makeTurn(0, "user", "Implement Relay as a fresh-chat bootstrap system that restores durable project state into new AI chats."),
      makeTurn(
        1,
        "assistant",
        "Relay should compress captures into project state, then generate a bounded bootstrap with goals, progress, tasks, and constraints."
      ),
      makeTurn(2, "user", "whats better? give me a really short answer")
    ]

    const digest = deterministicDigest(makeSession(), turns, state)

    expect(digest.currentObjectiveDelta).toBeNull()
    expect(digest.projectOverviewDelta).toBeNull()
    expect(digest.recentProgressDelta).toContain("Relay should compress captures into project state")
    expect(digest.newTasks).toEqual([])
    expect(digest.newDecisions).toEqual([])
    expect(digest.newConstraints).toEqual([])
  })

  it("only merges when no existing project overview (first capture)", () => {
    const turns = [
      makeTurn(0, "user", "Build Relay as a browser-first AI continuity layer that captures useful project context and restores it into fresh chats."),
      makeTurn(
        1,
        "assistant",
        "Relay should focus on a fresh-chat bootstrap flow, durable state, and one-click insertion instead of transcript dumping."
      ),
      makeTurn(
        2,
        "user",
        "1. yes 2. both, and also i believe your example chatgpt/claude planning packet is too small/short, the info you provided is not enough."
      ),
      makeTurn(3, "assistant", "Both: generate structured JSON internally, then render clean text/markdown on the surface.")
    ]

    // No existing state → shouldMerge = true (first capture)
    const digestNoState = deterministicDigest(makeSession(), turns, null)
    expect(digestNoState.shouldMerge).toBe(true)
    expect(digestNoState.currentObjectiveDelta).toBeNull()
    expect(digestNoState.recentProgressDelta).toContain("fresh-chat bootstrap flow")

    // Existing state with overview → shouldMerge = false
    const digestWithState = deterministicDigest(makeSession(), turns, makeState())
    expect(digestWithState.shouldMerge).toBe(false)
  })

  it("does not merge when only low-signal chatter is present", () => {
    const state = makeState()
    const turns = [makeTurn(0, "user", "yes"), makeTurn(1, "assistant", "Okay.")]

    const digest = deterministicDigest(makeSession(), turns, state)

    expect(digest.shouldMerge).toBe(false)
    expect(digest.currentObjectiveDelta).toBeNull()
    expect(digest.newTasks).toEqual([])
  })
})

describe("sanitizeDigest", () => {
  it("normalizes fractional importance scores into integer percentages", () => {
    const digest = sanitizeDigest({
      summaryShort: "Relay update",
      newDecisions: [],
      newConstraints: [],
      newTasks: [],
      projectOverviewDelta: null,
      currentObjectiveDelta: null,
      recentProgressDelta: null,
      relevantToolsDelta: [],
      importanceScore: 0.9,
      shouldMerge: true,
      confidence: 0.9
    })

    expect(digest.importanceScore).toBe(90)
  })
})
