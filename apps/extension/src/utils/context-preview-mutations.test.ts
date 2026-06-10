import { describe, expect, it } from "vitest"

import type { AssistantActionResult } from "@relay/shared"

import type { RelayContextPreview } from "../messaging/contracts"
import { applyActionResultToContextPreview } from "./context-preview-mutations"

const emptyPreview: RelayContextPreview = {
  decisions: [],
  constraints: [],
  tasks: [],
  notes: [],
  requirements: [],
}

describe("applyActionResultToContextPreview", () => {
  it("prepends created decisions into the decisions tab", () => {
    const result: AssistantActionResult = {
      tool: "add_memory",
      action: "created",
      entity: "memory item",
      count: 1,
      items: [
        {
          id: "m-new",
          label: "test",
          content: "test",
          type: "decision",
          projectId: "p1",
        },
      ],
      previews: [
        {
          after: {
            id: "m-new",
            label: "test",
            content: "test",
            type: "decision",
            projectId: "p1",
          },
        },
      ],
    }

    const next = applyActionResultToContextPreview(emptyPreview, result, "p1")
    expect(next.decisions).toHaveLength(1)
    expect(next.decisions[0]).toMatchObject({
      text: "test",
      memoryId: "m-new",
      source: "manual",
    })
  })

  it("removes deleted memory items from the preview", () => {
    const preview: RelayContextPreview = {
      ...emptyPreview,
      decisions: [
        {
          key: "manual:m-old",
          text: "old",
          source: "manual",
          memoryId: "m-old",
          sourceSurface: "ask_relay",
          capturedAt: "2026-06-09T00:00:00.000Z",
        },
      ],
    }
    const result: AssistantActionResult = {
      tool: "manage_memory",
      action: "deleted",
      entity: "memory item",
      count: 1,
      items: [{ id: "m-old", label: "old", content: "old", type: "decision", projectId: "p1" }],
      previews: [
        {
          before: {
            id: "m-old",
            label: "old",
            content: "old",
            type: "decision",
            projectId: "p1",
          },
        },
      ],
    }

    const next = applyActionResultToContextPreview(preview, result, "p1")
    expect(next.decisions).toHaveLength(0)
  })
})