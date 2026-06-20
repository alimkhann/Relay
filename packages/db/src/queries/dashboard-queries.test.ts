import { describe, expect, it } from "vitest"

import { getProjectDashboard } from "./dashboard-queries"

const project = {
  id: "project-1",
  name: "Relay",
  slug: "relay",
  description: null,
  projectUrl: null,
  updatedAt: "2026-05-01T00:00:00.000Z",
}

const session = {
  id: "session-1",
  platform: "chatgpt",
  title: "Launch notes",
  url: "https://chatgpt.com/c/1",
  pageFingerprint: null,
  captureSignature: null,
  sourceConversationId: "c/1",
  isArchived: false,
  archivedAt: null,
  capturedAt: "2026-05-01T00:00:00.000Z",
}

describe("getProjectDashboard", () => {
  it("counts turns without loading full turn rows", async () => {
    const dashboard = await getProjectDashboard({
      projects: {
        listByOwner: async () => [project],
      },
      memory: {
        countByProject: async () => 0,
        listRoutingSamplesByProject: async () => [],
        listByProject: async () => [],
      },
      sessions: {
        listByProject: async () => [session],
        countDistinctConversations: async () => 1,
      },
      turns: {
        listBySession: async () => {
          throw new Error("loaded full turn rows")
        },
        countBySessionIds: async () => new Map([["session-1", 4]]),
      },
      bootstrapPackets: { listByProject: async () => [] },
      contextPackets: { listByProject: async () => [] },
      targetProfiles: { listAll: async () => [] },
      projectState: { getByProject: async () => null },
      projectSettings: { getByProject: async () => null },
      projectStateOverrides: { getByProject: async () => null },
      sessionDigests: { listByProject: async () => [] },
      aiJobs: { listByProject: async () => [] },
    } as unknown as Parameters<typeof getProjectDashboard>[0], "user-1", "project-1")

    expect(dashboard?.recentSessions).toEqual([
      expect.objectContaining({ id: "session-1", turnCount: 4 }),
    ])
    expect(dashboard?.sessionHistory).toEqual([
      expect.objectContaining({ id: "session-1", turnCount: 4 }),
    ])
  })
})
