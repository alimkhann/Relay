import { describe, expect, it } from "vitest"

import { computeBootstrapInputHash, deterministicBootstrap, renderBootstrapMarkdown, shouldDeferBootstrapGeneration, shouldReuseLatestBootstrapPacket } from "./bootstrap-service"

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
    const content = renderBootstrapMarkdown(shape, profile, "fresh_chat_bootstrap", [], {
      packetMode: "chat_new",
    })

    expect(content).toContain("## What This Project Is")
    expect(content).toContain("## How To Continue")
  })

  it("renders an operational agent bootstrap when packetMode is agent_full_bootstrap", () => {
    const content = renderBootstrapMarkdown(shape, profile, "fresh_chat_bootstrap", [
      {
        id: "mem-1",
        projectId: "project-1",
        sourceTurnId: null,
        type: "note",
        title: null,
        content: "Need to preserve source-backed truth for agent execution.",
        pinned: false,
        isArchived: false,
        sortOrder: null,
        tags: [],
        metadata: {},
        createdBy: "user-1",
        createdAt: "2026-04-13T00:00:00.000Z",
        updatedAt: "2026-04-13T00:00:00.000Z",
        sourceSurface: "mcp",
        sourceConversationId: null,
        sourceUrl: null,
        capturedAt: "2026-04-13T00:00:00.000Z",
        derivedFrom: [],
        embedding: null,
        embeddingModel: null,
        forgetAfter: null,
        lastReaffirmedAt: null,
      },
    ], {
      packetMode: "agent_full_bootstrap",
      canonContext: {
        tentativeEntries: [],
        latestProjectSummary: "Relay is becoming a trusted continuity layer.",
        latestCurrentFocusSummary: "Phase 4 packet specialization in progress",
      },
    })

    expect(content).toContain("Use this execution brief")
    expect(content).toContain("## Current Truths")
    expect(content).toContain("## Supporting Evidence")
  })

  it("renders a shorter continuation brief without empty sections", () => {
    const content = renderBootstrapMarkdown({ ...shape, relevantTools: [], decisions: [] }, profile, "quick_continuity", [], {
      packetMode: "chat_continue",
    })

    expect(content).toContain("Current objective:")
    expect(content).not.toContain("## What This Project Is")
    expect(content).not.toContain("None recorded")
  })

  it("renders a compact browser-chat smart delta with cross-surface context", () => {
    const content = renderBootstrapMarkdown(shape, {
      ...profile,
      key: "chatgpt_planning",
      name: "ChatGPT",
      platform: "chatgpt",
    }, "fresh_chat_bootstrap", [
      {
        id: "mem-1",
        projectId: "project-1",
        sourceTurnId: null,
        type: "decision",
        title: null,
        content: "Use local stdio MCP as the default coding-agent transport.",
        pinned: true,
        isArchived: false,
        sortOrder: null,
        tags: [],
        metadata: {},
        createdBy: "user-1",
        createdAt: "2026-04-13T00:00:00.000Z",
        updatedAt: "2026-04-13T00:00:00.000Z",
        sourceSurface: "mcp",
        sourceConversationId: null,
        sourceUrl: null,
        capturedAt: "2026-04-13T00:00:00.000Z",
        derivedFrom: [],
        embedding: null,
        embeddingModel: null,
        forgetAfter: null,
        lastReaffirmedAt: null,
      },
    ], {
      packetMode: "chat_smart_delta",
      delta: {
        summaries: ["Codex finished the extension capture audit."],
        decisions: [],
        constraints: [],
        tasks: ["Add a manual save destination label."],
        notes: [],
      },
    })

    expect(content).toContain("compact Relay context")
    expect(content).toContain("## Foundational Truths")
    expect(content).toContain("## Likely Missing From This Chat")
    expect(content).toContain("Codex finished the extension capture audit.")
    expect(content.length / 4).toBeLessThan(1200)
  })

  it("renders agent quick continuity differently from chat continuation", () => {
    const content = renderBootstrapMarkdown(shape, profile, "quick_continuity", [], {
      packetMode: "agent_quick_continuity",
      delta: {
        summaries: ["Observer landed canon updates."],
        decisions: [],
        constraints: [],
        tasks: [],
        notes: [],
      },
      canonContext: {
        tentativeEntries: [],
        latestProjectSummary: null,
        latestCurrentFocusSummary: "Use canon-aware packets.",
      },
    })

    expect(content).toContain("## Current Objective")
    expect(content).toContain("## Open Tasks")
    expect(content).toContain("## Recent Changes")
  })

  it("can suppress tentative updates in packets via settings", () => {
    const content = renderBootstrapMarkdown(shape, profile, "quick_continuity", [], {
      packetMode: "chat_continue",
      settings: { includeTentativeUpdatesInPackets: false },
      canonContext: {
        tentativeEntries: [
          {
            id: "canon-1",
            projectId: "project-1",
            kind: "decision",
            title: null,
            content: "Tentative pricing update.",
            status: "tentative",
            confidence: 0.7,
            lockedByUser: false,
            autoGenerated: true,
            validFrom: null,
            validUntil: null,
            lastVerifiedAt: null,
            supersedesEntryId: null,
            metadata: {},
            createdBy: "user-1",
            updatedBy: null,
            createdAt: "2026-04-13T00:00:00.000Z",
            updatedAt: "2026-04-13T00:00:00.000Z",
          },
        ],
        latestProjectSummary: null,
        latestCurrentFocusSummary: null,
      },
    })

    expect(content).not.toContain("Tentative Updates")
  })

  it("includes tentative canon updates in continuation briefs", () => {
    const content = renderBootstrapMarkdown({ ...shape }, profile, "quick_continuity", [], {
      canonContext: {
        tentativeEntries: [
          {
            id: "canon-1",
            projectId: "project-1",
            kind: "decision",
            title: null,
            content: "Maybe move MCP refresh to background retries.",
            status: "tentative",
            confidence: 0.7,
            lockedByUser: false,
            autoGenerated: true,
            validFrom: null,
            validUntil: null,
            lastVerifiedAt: null,
            supersedesEntryId: null,
            metadata: {},
            createdBy: "user-1",
            updatedBy: null,
            createdAt: "2026-04-13T00:00:00.000Z",
            updatedAt: "2026-04-13T00:00:00.000Z",
          },
        ],
        latestProjectSummary: null,
        latestCurrentFocusSummary: null,
      },
    })

    expect(content).toContain("## Tentative Updates")
    expect(content).toContain("Maybe move MCP refresh to background retries.")
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
        objectiveHistory: [],
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
    // quick_continuity prefers the raw digest summary over the richer recentProgressDelta
    expect(nextShape.recentProgress).toContain("quietly recapture changed turns")
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

  it("reuses a cached brief when the computed input hash is unchanged", () => {
    expect(
      shouldReuseLatestBootstrapPacket({
        latestCreatedAt: "2026-03-11T00:00:00.000Z",
        latestDigestCreatedAt: "2026-03-12T00:00:00.000Z",
        stateDirty: true,
        deep: true,
        latestInputHash: "hash-1",
        currentInputHash: "hash-1",
      })
    ).toBe(true)
  })

  it("refuses to reuse a cached brief while a newer capture is still pending digest", () => {
    expect(
      shouldReuseLatestBootstrapPacket({
        latestCreatedAt: "2026-03-11T00:00:00.000Z",
        latestDigestCreatedAt: "2026-03-10T00:00:00.000Z",
        stateDirty: false,
        deep: false,
        hasPendingCapture: true,
      })
    ).toBe(false)
  })
})

describe("computeBootstrapInputHash", () => {
  it("changes when relevant project context changes", () => {
    const profile = {
      id: "profile-1",
      key: "claude_code_build",
      name: "Claude Build",
      platform: "claude_code",
      description: null,
      config: {},
      createdAt: "2026-03-11T00:00:00.000Z",
    } as const

    const baseHash = computeBootstrapInputHash({
      project: {
        id: "project-1",
        ownerId: "user-1",
        name: "Relay",
        slug: "relay",
        description: "Carry-forward AI project context.",
        projectUrl: null,
        isArchived: false,
        createdAt: "2026-03-11T00:00:00.000Z",
        updatedAt: "2026-03-11T00:00:00.000Z",
      },
      state: {
        projectId: "project-1",
        projectOverview: "Carry-forward AI project context.",
        currentObjective: "Ship the toast fix.",
        stackDomain: null,
        recentProgress: "The background state is now shared.",
        decisions: ["Use deterministic routing first."],
        constraints: ["Do not block chat load on long hydration."],
        openTasks: ["Fix the initial toast."],
        relevantTools: ["Claude Build"],
        objectiveHistory: [],
        lastBootstrapAt: null,
        dirty: false,
        createdAt: "2026-03-11T00:00:00.000Z",
        updatedAt: "2026-03-11T00:00:00.000Z",
      },
      digests: [],
      profile,
      kind: "fresh_chat_bootstrap",
    })

    const nextHash = computeBootstrapInputHash({
      project: {
        id: "project-1",
        ownerId: "user-1",
        name: "Relay",
        slug: "relay",
        description: "Carry-forward AI project context.",
        projectUrl: null,
        isArchived: false,
        createdAt: "2026-03-11T00:00:00.000Z",
        updatedAt: "2026-03-11T00:00:00.000Z",
      },
      state: {
        projectId: "project-1",
        projectOverview: "Carry-forward AI project context.",
        currentObjective: "Ship the autonomous toast fix.",
        stackDomain: null,
        recentProgress: "The background state is now shared.",
        decisions: ["Use deterministic routing first."],
        constraints: ["Do not block chat load on long hydration."],
        openTasks: ["Fix the initial toast."],
        relevantTools: ["Claude Build"],
        objectiveHistory: [],
        lastBootstrapAt: null,
        dirty: false,
        createdAt: "2026-03-11T00:00:00.000Z",
        updatedAt: "2026-03-11T00:00:00.000Z",
      },
      digests: [],
      profile,
      kind: "fresh_chat_bootstrap",
    })

    expect(nextHash).not.toBe(baseHash)
  })

  it("changes when canon entries change", () => {
    const profile = {
      id: "profile-1",
      key: "claude_code_build",
      name: "Claude Build",
      platform: "claude_code",
      description: null,
      config: {},
      createdAt: "2026-03-11T00:00:00.000Z",
    } as const

    const common = {
      project: {
        id: "project-1",
        ownerId: "user-1",
        name: "Relay",
        slug: "relay",
        description: "Carry-forward AI project context.",
        projectUrl: null,
        isArchived: false,
        createdAt: "2026-03-11T00:00:00.000Z",
        updatedAt: "2026-03-11T00:00:00.000Z",
      },
      state: null,
      digests: [],
      profile,
      kind: "fresh_chat_bootstrap" as const,
    }

    const baseHash = computeBootstrapInputHash({
      ...common,
      canonEntries: [],
      summarySnapshots: [],
    })

    const nextHash = computeBootstrapInputHash({
      ...common,
      canonEntries: [
        {
          id: "canon-1",
          projectId: "project-1",
          kind: "objective",
          title: null,
          content: "Ship phase 3.",
          status: "active",
          confidence: 0.8,
          lockedByUser: false,
          autoGenerated: true,
          validFrom: null,
          validUntil: null,
          lastVerifiedAt: null,
          supersedesEntryId: null,
          metadata: {},
          createdBy: "user-1",
          updatedBy: null,
          createdAt: "2026-04-13T00:00:00.000Z",
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
      ],
      summarySnapshots: [],
    })

    expect(nextHash).not.toBe(baseHash)
  })
})
