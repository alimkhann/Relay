import { describe, expect, it } from "vitest";

import {
  buildProjectMemoryOverridePatch,
  deriveProjectMemoryDrafts,
} from "./project-memory-state";

describe("project memory state helpers", () => {
  it("falls back to the project description when overview state is missing", () => {
    const drafts = deriveProjectMemoryDrafts({
      dashboard: {
        project: {
          id: "project-1",
          name: "Relay",
          slug: "relay",
          description: "Carry-forward memory for AI chats.",
          memoryCount: 0,
          sessionCount: 0,
          routingContext: null,
          updatedAt: new Date().toISOString(),
        },
        projectState: null,
        derivedProjectState: null,
        stateOverrides: null,
        stateStatus: {
          rawCapturePresent: false,
          digestStatus: "idle",
          projectStateReady: false,
          digestErrorMessage: null,
          lastCapturedAt: null,
          lastDigestAt: null,
          activeJobId: null,
          activeJobStatus: "idle",
          activeJobStage: null,
          activeJobAttempts: 0,
          fallbackPlanned: false,
          fallbackUsed: false,
        },
        recentSessions: [],
        sessionHistory: [],
        distinctConversationCount: 0,
        recentDigests: [],
        memory: [],
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
      },
      fallbackOverview: "Carry-forward memory for AI chats.",
    });

    expect(drafts.overview).toBe("Carry-forward memory for AI chats.");
    expect(drafts.objective).toBe("");
    expect(drafts.progress).toBe("");
  });

  it("builds a partial override patch instead of nulling untouched fields", () => {
    const patch = buildProjectMemoryOverridePatch(
      {
        overview: "Fresh overview",
        objective: "Keep this",
        progress: "Still here",
      },
      {
        overview: "Old overview",
        objective: "Keep this",
        progress: "Still here",
      },
    );

    expect(patch).toEqual({
      projectOverviewOverride: "Fresh overview",
    });
  });

  it("returns null when nothing changed", () => {
    expect(
      buildProjectMemoryOverridePatch(
        {
          overview: "Same",
          objective: "Same",
          progress: "Same",
        },
        {
          overview: "Same",
          objective: "Same",
          progress: "Same",
        },
      ),
    ).toBeNull();
  });
});
