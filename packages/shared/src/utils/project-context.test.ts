import { describe, expect, it } from "vitest"

import type { ProjectDashboardDto } from "../types/project"
import { buildProjectContextItems, getProjectContextCounts } from "./project-context"

function makeDashboard(): ProjectDashboardDto {
  return {
    project: {
      id: "project_123",
      name: "Relay",
      slug: "relay",
      description: null,
      projectUrl: null,
      memoryCount: 0,
      sessionCount: 0,
      routingContext: null,
      updatedAt: "2026-03-26T00:00:00.000Z",
    },
    projectState: {
      projectOverview: null,
      currentObjective: null,
      stackDomain: null,
      recentProgress: null,
      decisions: [
        "Adopted Next.js, Postgres, and Tailwind stack.",
        "Use Neon for Postgres hosting.",
      ],
      constraints: ["Keep the onboarding lightweight."],
      openTasks: ["Ship the extension onboarding flow."],
      relevantTools: [],
      lastBootstrapAt: null,
      dirty: false,
      updatedAt: "2026-03-26T00:00:00.000Z",
    },
    derivedProjectState: {
      projectOverview: null,
      currentObjective: null,
      stackDomain: null,
      recentProgress: null,
      decisions: [
        "Adopted Next.js, Postgres, and Tailwind stack.",
        "Use Neon for Postgres hosting.",
      ],
      constraints: ["Keep the onboarding lightweight."],
      openTasks: ["Ship the extension onboarding flow."],
      relevantTools: [],
      lastBootstrapAt: null,
      dirty: false,
      updatedAt: "2026-03-26T00:00:00.000Z",
    },
    stateOverrides: {
      projectOverviewOverride: null,
      currentObjectiveOverride: null,
      recentProgressOverride: null,
      hiddenDecisions: [],
      hiddenConstraints: [],
      hiddenOpenTasks: [],
      updatedAt: "2026-03-26T00:00:00.000Z",
    },
    stateStatus: {
      rawCapturePresent: true,
      digestStatus: "completed",
      projectStateReady: true,
      digestErrorMessage: null,
      lastCapturedAt: null,
      lastDigestAt: null,
      activeJobId: null,
      activeJobStatus: "completed",
      activeJobStage: "completed",
      activeJobAttempts: 1,
      fallbackPlanned: false,
      fallbackUsed: false,
    },
    recentSessions: [],
    sessionHistory: [],
    distinctConversationCount: 0,
    recentDigests: [],
    memory: [
      {
        id: "mem_1",
        type: "decision",
        title: null,
        content: "Adopted Next.js, Postgres, and Tailwind stack.",
        pinned: false,
        updatedAt: "2026-03-26T00:00:00.000Z",
        sourceSurface: "claude",
        sourceUrl: "https://claude.ai/chat/demo",
        capturedAt: "2026-03-26T00:00:00.000Z",
        decayScore: 1,
        lastReaffirmedAt: null,
      },
      {
        id: "mem_2",
        type: "decision",
        title: null,
        content: "Use Neon for Postgres hosting.",
        pinned: false,
        updatedAt: "2026-03-25T00:00:00.000Z",
        sourceSurface: "chatgpt",
        sourceUrl: "https://chatgpt.com/c/demo",
        capturedAt: "2026-03-25T00:00:00.000Z",
        decayScore: 1,
        lastReaffirmedAt: null,
      },
    ],
    packets: [],
    legacyPackets: [],
    aiBudget: {
      plan: "free",
      aiEligible: true,
      reason: null,
      dailyProjectAiUsed: 0,
      dailyProjectAiLimit: 0,
      dailyUserAiUsed: 0,
      dailyUserAiLimit: 0,
      dailyProjectAiRemaining: 0,
      dailyUserAiRemaining: 0,
      nextAiAllowedAt: null,
    },
  }
}

describe("project context helpers", () => {
  it("deduplicates raw manual and derived context counts to match effective state", () => {
    const dashboard = makeDashboard()

    expect(getProjectContextCounts(dashboard)).toEqual({
      all: 4,
      decisions: 2,
      constraints: 1,
      tasks: 1,
      notes: 0,
      requirements: 0,
      artifacts: 0,
    })
  })

  it("preserves manual provenance when an effective item matches saved memory", () => {
    const dashboard = makeDashboard()

    expect(buildProjectContextItems(dashboard, "decision")).toEqual([
      {
        key: "manual:mem_1",
        section: "decision",
        text: "Adopted Next.js, Postgres, and Tailwind stack.",
        source: "manual",
        memoryId: "mem_1",
        sourceSurface: "claude",
        capturedAt: "2026-03-26T00:00:00.000Z",
      },
      {
        key: "manual:mem_2",
        section: "decision",
        text: "Use Neon for Postgres hosting.",
        source: "manual",
        memoryId: "mem_2",
        sourceSurface: "chatgpt",
        capturedAt: "2026-03-25T00:00:00.000Z",
      },
    ])
  })

  it("surfaces a newly created manual governed item before state reconciliation", () => {
    const dashboard = makeDashboard()
    dashboard.projectState = dashboard.projectState
      ? { ...dashboard.projectState, decisions: [], constraints: [], openTasks: [] }
      : null
    dashboard.memory = [
        {
          id: "mem-new",
          type: "decision",
          title: null,
          content: "Use targeted optimistic updates.",
          pinned: false,
          metadata: {},
          sourceSurface: "manual",
          sourceUrl: null,
          capturedAt: "2026-06-09T00:00:00.000Z",
          decayScore: 1,
          lastReaffirmedAt: null,
          updatedAt: "2026-06-09T00:00:00.000Z"
        }
      ] as ProjectDashboardDto["memory"]

    expect(buildProjectContextItems(dashboard, "decision")).toEqual([
      expect.objectContaining({
        key: "manual:mem-new",
        memoryId: "mem-new",
        text: "Use targeted optimistic updates."
      })
    ])
  })
})
