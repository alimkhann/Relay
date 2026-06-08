import { describe, expect, it } from "vitest"

import type { AssistantActionResult } from "../types/assistant"
import type { MemoryItemDto, ProjectDashboardDto } from "../types/project"
import {
  actionResultToMemoryMutations,
  applyMemoryMutationToDashboard,
  type MemoryMutationEnvelope,
} from "./memory-mutations"

function item(id: string, content: string): MemoryItemDto {
  return {
    id,
    type: "note",
    title: null,
    content,
    pinned: false,
    updatedAt: "2026-06-09T00:00:00.000Z",
    sourceSurface: "manual",
    sourceUrl: null,
    capturedAt: "2026-06-09T00:00:00.000Z",
    decayScore: 1,
    lastReaffirmedAt: null
  }
}

function dashboard(projectId: string, memory: MemoryItemDto[]): ProjectDashboardDto {
  return { project: { id: projectId }, memory } as ProjectDashboardDto
}

describe("actionResultToMemoryMutations", () => {
  it("maps add_memory creates into dashboard mutation envelopes", () => {
    const result: AssistantActionResult = {
      tool: "add_memory",
      action: "created",
      entity: "memory item",
      count: 1,
      items: [
        {
          id: "m-new",
          label: "Use focused tests",
          content: "Use focused tests",
          type: "decision",
          projectId: "p1",
        },
      ],
      previews: [
        {
          after: {
            id: "m-new",
            label: "Use focused tests",
            content: "Use focused tests",
            type: "decision",
            projectId: "p1",
          },
        },
      ],
    }

    expect(actionResultToMemoryMutations(result, "p1")).toEqual([
      expect.objectContaining({
        operation: "create",
        sourceProjectId: "p1",
        after: expect.objectContaining({ id: "m-new", type: "decision" }),
      }),
    ])
  })

  it("maps manage_memory deletes into remove envelopes", () => {
    const result: AssistantActionResult = {
      tool: "manage_memory",
      action: "deleted",
      entity: "memory item",
      count: 1,
      items: [{ id: "m-old", label: "old", content: "old", type: "note", projectId: "p1" }],
      previews: [
        {
          before: { id: "m-old", label: "old", content: "old", type: "note", projectId: "p1" },
        },
      ],
    }

    expect(actionResultToMemoryMutations(result)[0]).toMatchObject({
      operation: "delete",
      sourceProjectId: "p1",
    })
  })
})

describe("applyMemoryMutationToDashboard", () => {
  it("prepends creates and replaces updates at the top", () => {
    const created: MemoryMutationEnvelope = {
      operation: "create",
      status: "optimistic",
      sourceProjectId: "p1",
      after: item("new", "new")
    }
    const updated: MemoryMutationEnvelope = {
      operation: "update",
      status: "succeeded",
      sourceProjectId: "p1",
      before: item("old", "old"),
      after: item("old", "updated")
    }

    const withCreate = applyMemoryMutationToDashboard(dashboard("p1", [item("old", "old")]), created)
    const withUpdate = applyMemoryMutationToDashboard(withCreate, updated)

    expect(withCreate.memory.map((entry) => entry.id)).toEqual(["new", "old"])
    expect(withUpdate.memory.map((entry) => entry.content)).toEqual(["updated", "new"])
  })

  it("removes deleted and transferred items from the source project", () => {
    const moved: MemoryMutationEnvelope = {
      operation: "transfer",
      status: "succeeded",
      sourceProjectId: "p1",
      targetProjectId: "p2",
      before: item("m1", "move me"),
      after: item("m1", "move me")
    }

    expect(applyMemoryMutationToDashboard(dashboard("p1", [item("m1", "move me")]), moved).memory).toEqual([])
    expect(applyMemoryMutationToDashboard(dashboard("p2", []), moved).memory[0]?.id).toBe("m1")
  })
})
