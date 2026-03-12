import { describe, expect, it } from "vitest"

import { deterministicBootstrap, renderBootstrapMarkdown, shouldDeferBootstrapGeneration, shouldReuseLatestBootstrapPacket } from "./bootstrap-service"

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

describe("renderBootstrapMarkdown", () => {
  const profile = {
    id: "profile-1",
    key: "claude_code_build",
    name: "Claude Build",
    platform: "claude_code",
    description: null,
    config: {},
    createdAt: "2026-03-11T00:00:00.000Z"
  } as const

  const shape = {
    projectOverview: "Relay keeps project context ready for fresh chats.",
    currentObjective: "Ship the quiet assistant rewrite.",
    recentProgress: "The sidepanel and chip now share one insert path.",
    decisions: ["Use one-click insertion."],
    constraints: ["Do not require a preview step."],
    openTasks: ["Finish verification."],
    relevantTools: [],
    firstAction: "Continue from the latest project brief."
  }

  it("renders a richer fresh-chat brief", () => {
    const content = renderBootstrapMarkdown(shape, profile, "fresh_chat_bootstrap")

    expect(content).toContain("## What This Project Is")
    expect(content).toContain("## How This Chat Should Continue")
  })

  it("renders a shorter continuation brief without empty sections", () => {
    const content = renderBootstrapMarkdown({ ...shape, relevantTools: [], decisions: [] }, profile, "quick_continuity")

    expect(content).toContain("Current objective:")
    expect(content).not.toContain("## What This Project Is")
    expect(content).not.toContain("None recorded")
  })

  it("prefers a newer digest over older merged state when building deterministic briefs", () => {
    const nextShape = deterministicBootstrap(
      {
        projectId: "project-1",
        projectOverview: "Relay keeps old context.",
        currentObjective: "Old objective",
        stackDomain: null,
        recentProgress: "Old progress",
        decisions: ["Ship the sidepanel"],
        constraints: [],
        openTasks: ["Old task"],
        relevantTools: ["Claude Build"],
        lastBootstrapAt: null,
        dirty: false,
        createdAt: "2026-03-11T00:00:00.000Z",
        updatedAt: "2026-03-11T00:00:00.000Z"
      },
      [
        {
          id: "digest-1",
          projectId: "project-1",
          sourceSessionId: "session-1",
          sourceSignature: "sig",
          summaryShort: "Relay now needs the extension to quietly recapture changed turns.",
          structuredDigest: {
            currentObjectiveDelta: "Make quiet recapture work on existing chats.",
            recentProgressDelta: "The chip and sidepanel now share the same tab state.",
            newTasks: ["Verify recapture after a streamed assistant reply."]
          },
          confidence: 0.8,
          importanceScore: 82,
          needsProjectStateMerge: true,
          mergedAt: null,
          createdBy: "user-1",
          createdAt: "2026-03-12T00:00:00.000Z"
        }
      ],
      profile,
      "quick_continuity"
    )

    expect(nextShape.currentObjective).toBe("Make quiet recapture work on existing chats.")
    expect(nextShape.recentProgress).toContain("share the same tab state")
    expect(nextShape.openTasks).toContain("Verify recapture after a streamed assistant reply.")
  })
})

describe("shouldReuseLatestBootstrapPacket", () => {
  it("invalidates a cached brief when a newer digest exists even if project state is not dirty", () => {
    expect(
      shouldReuseLatestBootstrapPacket({
        latestCreatedAt: "2026-03-11T00:00:00.000Z",
        latestDigestCreatedAt: "2026-03-12T00:00:00.000Z",
        stateDirty: false,
        deep: false
      })
    ).toBe(false)
  })
})
