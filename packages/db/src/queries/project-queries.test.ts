import { describe, expect, it } from "vitest"

import { getProjectSummaries } from "./project-queries"

describe("getProjectSummaries", () => {
  it("builds summaries without loading full memory or session rows", async () => {
    const summaries = await getProjectSummaries({
      projects: {
        listByOwner: async () => [{
          id: "project-1",
          name: "Relay",
          slug: "relay",
          description: "Project memory",
          projectUrl: "https://example.com",
          updatedAt: "2026-05-01T00:00:00.000Z",
        }],
      },
      memory: {
        listByProject: async () => {
          throw new Error("loaded full memory rows")
        },
        countByProject: async () => 12,
        listRoutingSamplesByProject: async () => [
          { title: "Decision", content: "Use lightweight routing samples." },
        ],
      },
      sessions: {
        listByProject: async () => {
          throw new Error("loaded full session rows")
        },
        countDistinctConversations: async () => 3,
      },
      projectState: {
        getByProject: async () => ({
          projectOverview: "Relay stores project context.",
          currentObjective: "Reduce Neon egress.",
          recentProgress: null,
          decisions: [],
          constraints: [],
          openTasks: [],
          relevantTools: [],
        }),
      },
      projectSettings: {
        getByProject: async () => ({ settings: { autoCapture: false } }),
      },
    } as unknown as Parameters<typeof getProjectSummaries>[0], "user-1")

    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({
      id: "project-1",
      memoryCount: 12,
      sessionCount: 3,
      autoCapture: false,
      routingContext: {
        hasMeaningfulContext: true,
      },
    })
  })
})
