import { describe, expect, it } from "vitest"

import { getRankedMemory } from "./memory-queries"

describe("getRankedMemory", () => {
  it("prioritizes pinned decisions before other memory", async () => {
    const items = await getRankedMemory(
      {
        memory: {
          listByProject: async () => [
            {
              id: "1",
              projectId: "project-1",
              sourceTurnId: null,
              type: "constraint",
              title: null,
              content: "Ship with narrow permissions.",
              pinned: true,
              isArchived: false,
              sortOrder: null,
              metadata: {},
              createdBy: "user-1",
              createdAt: "2026-03-10T00:00:00.000Z",
              updatedAt: "2026-03-10T00:00:00.000Z"
            },
            {
              id: "2",
              projectId: "project-1",
              sourceTurnId: null,
              type: "decision",
              title: null,
              content: "Use Neon Auth.",
              pinned: true,
              isArchived: false,
              sortOrder: null,
              metadata: {},
              createdBy: "user-1",
              createdAt: "2026-03-10T00:00:00.000Z",
              updatedAt: "2026-03-10T00:00:00.000Z"
            }
          ]
        }
      } as unknown as Parameters<typeof getRankedMemory>[0],
      "project-1"
    )

    expect(items[0]?.type).toBe("decision")
    expect(items[1]?.type).toBe("constraint")
  })
})
