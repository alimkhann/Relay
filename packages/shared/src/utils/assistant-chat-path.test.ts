import { describe, expect, it } from "vitest"

import type { AssistantActionResult, AssistantMessageDto } from "../types/assistant"

import {
  appendActionResult,
  derivePath,
  shouldRenderPendingAction,
  suppressActionResultsOnPendingRows,
  type UiMessage
} from "./assistant-chat-path"

const created: AssistantActionResult = {
  tool: "add_memory",
  action: "created",
  entity: "memory item",
  count: 1,
  items: [{ id: "mem1", label: "test" }]
}

const updated: AssistantActionResult = {
  tool: "manage_memory",
  action: "updated",
  entity: "memory item",
  count: 1,
  items: [{ id: "m1", label: "test 2" }]
}

function msg(
  id: string,
  parentId: string | null,
  role: "user" | "assistant",
  createdAt: string,
  extra: Partial<AssistantMessageDto> = {}
): AssistantMessageDto {
  return {
    id,
    parentId,
    role,
    content: `${role}:${id}`,
    toolName: null,
    actionResult: null,
    actionResults: [],
    attachments: [],
    feedback: null,
    createdAt,
    ...extra
  }
}

describe("appendActionResult", () => {
  it("dedupes identical streamed results", () => {
    expect(appendActionResult([created], created)).toEqual([created])
    expect(appendActionResult([created], updated)).toEqual([created, updated])
  })
})

describe("shouldRenderPendingAction", () => {
  const pending = {
    id: "a1",
    tool: "manage_memory",
    summary: "update 1 memory item(s)",
    args: {}
  }

  it("shows confirm chrome for pending and running", () => {
    expect(shouldRenderPendingAction({ ...pending, status: "pending" }, [])).toBe(true)
    expect(shouldRenderPendingAction({ ...pending, status: "running" }, [])).toBe(true)
  })

  it("hides terminal statuses and resolved pending payloads", () => {
    expect(shouldRenderPendingAction({ ...pending, status: "succeeded" }, [])).toBe(false)
    expect(shouldRenderPendingAction({ ...pending, status: "failed" }, [])).toBe(false)
    expect(shouldRenderPendingAction({ ...pending, status: "declined" }, [])).toBe(false)
    expect(
      shouldRenderPendingAction({ ...pending, status: "pending", result: created }, []),
    ).toBe(false)
  })

  it("keeps confirm chrome when earlier results exist in the same turn", () => {
    expect(shouldRenderPendingAction({ ...pending, status: "pending" }, [created])).toBe(true)
    expect(shouldRenderPendingAction({ ...pending, status: "running" }, [created])).toBe(true)
  })
})

describe("suppressActionResultsOnPendingRows", () => {
  it("clears cards on ancestor pending_action rows when a later assistant aggregates results", () => {
    const nodes: UiMessage[] = [
      {
        id: "u1",
        parentId: null,
        role: "user",
        content: "go",
        actionResults: [],
        pendingActions: [],
        toolSteps: [],
        attachments: [],
        feedback: null
      },
      {
        id: "p1",
        parentId: "u1",
        role: "assistant",
        content: "",
        toolName: "pending_action",
        actionResults: [created],
        pendingActions: [],
        toolSteps: [],
        attachments: [],
        feedback: null
      },
      {
        id: "a1",
        parentId: "p1",
        role: "assistant",
        content: "done",
        toolName: null,
        actionResults: [created, updated],
        pendingActions: [],
        toolSteps: [],
        attachments: [],
        feedback: null
      }
    ]
    const out = suppressActionResultsOnPendingRows(nodes)
    expect(out.find((n) => n.id === "p1")?.actionResults).toEqual([])
    expect(out.find((n) => n.id === "a1")?.actionResults).toEqual([created, updated])
  })
})

describe("derivePath pending_action hydration", () => {
  it("hydrates intermediate actionResults saved on a pending_action row", () => {
    const nodes = [
      msg("u1", null, "user", "1"),
      msg("p1", "u1", "assistant", "2", {
        toolName: "pending_action",
        actionResults: [created],
        pending: {
          id: "pending-1",
          tool: "manage_memory",
          summary: "update 1 memory item(s)",
          args: { action: "update", memoryId: "m1", content: "test 2" },
          status: "pending"
        }
      })
    ]
    const { nodes: path } = derivePath(nodes, {})
    const pendingRow = path.find((n) => n.id === "p1")
    expect(pendingRow?.actionResults).toEqual([created])
    expect(pendingRow?.pending?.summary).toContain("update")
  })
})
