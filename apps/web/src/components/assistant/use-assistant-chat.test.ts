import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"

import type { AssistantActionResult, AssistantMessageDto } from "@relay/shared"

import { derivePath, spliceOptimistic, useAssistantChat, type UiMessage } from "./use-assistant-chat"

function msg(
  id: string,
  parentId: string | null,
  role: "user" | "assistant",
  createdAt: string,
  actionResults: AssistantActionResult[] = []
): AssistantMessageDto {
  return {
    id,
    parentId,
    role,
    content: `${role}:${id}`,
    toolName: null,
    actionResult: actionResults[0] ?? null,
    actionResults,
    feedback: null,
    createdAt
  }
}

describe("derivePath branch reconstruction", () => {
  it("walks a linear conversation with no branch controls", () => {
    const nodes = [
      msg("u1", null, "user", "1"),
      msg("a1", "u1", "assistant", "2"),
      msg("u2", "a1", "user", "3"),
      msg("a2", "u2", "assistant", "4")
    ]
    const { nodes: path, leafId } = derivePath(nodes, {})
    expect(path.map((n) => n.id)).toEqual(["u1", "a1", "u2", "a2"])
    expect(leafId).toBe("a2")
    expect(path.every((n) => !n.branch)).toBe(true)
  })

  it("defaults to the newest branch and exposes sibling cycling metadata", () => {
    const nodes = [
      msg("u1", null, "user", "1"),
      msg("a1", "u1", "assistant", "2"),
      msg("u2a", "a1", "user", "3"),
      msg("a2a", "u2a", "assistant", "4"),
      // edited variant of u2a (same parent a1), created later → default selection
      msg("u2b", "a1", "user", "5"),
      msg("a2b", "u2b", "assistant", "6")
    ]
    const { nodes: path } = derivePath(nodes, {})
    expect(path.map((n) => n.id)).toEqual(["u1", "a1", "u2b", "a2b"])
    const branched = path.find((n) => n.id === "u2b")
    expect(branched?.branch).toEqual({ index: 2, total: 2, siblingIds: ["u2a", "u2b"] })
  })

  it("follows an explicit branch selection", () => {
    const nodes = [
      msg("u1", null, "user", "1"),
      msg("a1", "u1", "assistant", "2"),
      msg("u2a", "a1", "user", "3"),
      msg("a2a", "u2a", "assistant", "4"),
      msg("u2b", "a1", "user", "5"),
      msg("a2b", "u2b", "assistant", "6")
    ]
    const { nodes: path } = derivePath(nodes, { a1: "u2a" })
    expect(path.map((n) => n.id)).toEqual(["u1", "a1", "u2a", "a2a"])
    expect(path.find((n) => n.id === "u2a")?.branch?.index).toBe(1)
  })
})

function ui(id: string, parentId: string | null, role: "user" | "assistant"): UiMessage {
  return { id, parentId, role, content: `${role}:${id}`, actionResults: [], feedback: null }
}

describe("derivePath action-result persistence (cards survive refresh)", () => {
  it("hydrates actionResults from the persisted assistant message", () => {
    const created: AssistantActionResult = {
      tool: "add_memory",
      action: "created",
      entity: "memory item",
      count: 1,
      items: [{ id: "mem1", label: "Use Postgres" }]
    }
    const nodes = [
      msg("u1", null, "user", "1"),
      msg("a1", "u1", "assistant", "2", [created])
    ]
    const { nodes: path } = derivePath(nodes, {})
    const assistant = path.find((n) => n.id === "a1")
    expect(assistant?.actionResults).toEqual([created])
  })

  it("falls back to the legacy singular actionResult", () => {
    const updated: AssistantActionResult = {
      tool: "manage_memory",
      action: "updated",
      entity: "memory item",
      count: 2,
      items: []
    }
    const legacy = {
      id: "a1",
      parentId: "u1",
      role: "assistant" as const,
      content: "done",
      toolName: null,
      actionResult: updated,
      feedback: null,
      createdAt: "2"
    } as AssistantMessageDto
    const nodes = [msg("u1", null, "user", "1"), legacy]
    const { nodes: path } = derivePath(nodes, {})
    expect(path.find((n) => n.id === "a1")?.actionResults).toEqual([updated])
  })
})

describe("spliceOptimistic", () => {
  const base = [ui("u1", null, "user"), ui("a1", "u1", "assistant"), ui("u2", "a1", "user"), ui("a2", "u2", "assistant")]

  it("returns the base path unchanged when nothing is in flight", () => {
    expect(spliceOptimistic(base, [], "a2")).toBe(base)
  })

  it("appends a normal send after the current leaf (full context kept)", () => {
    const optimistic = [ui("tmp-u", "a2", "user"), ui("tmp-a", "tmp-u", "assistant")]
    // send() passes the leaf id as the branch parent
    const out = spliceOptimistic(base, optimistic, "a2")
    expect(out.map((n) => n.id)).toEqual(["u1", "a1", "u2", "a2", "tmp-u", "tmp-a"])
  })

  it("replaces an edited prompt in place, dropping the stale sibling subtree", () => {
    // editing u2 sends its parent a1 as the branch parent
    const optimistic = [ui("tmp-u", "a1", "user"), ui("tmp-a", "tmp-u", "assistant")]
    const out = spliceOptimistic(base, optimistic, "a1")
    // old u2 / a2 are gone — no flicker, no "appeared then swapped"
    expect(out.map((n) => n.id)).toEqual(["u1", "a1", "tmp-u", "tmp-a"])
  })

  it("editing the first user message yields only the optimistic turn", () => {
    const optimistic = [ui("tmp-u", null, "user"), ui("tmp-a", "tmp-u", "assistant")]
    const out = spliceOptimistic(base, optimistic, null)
    expect(out.map((n) => n.id)).toEqual(["tmp-u", "tmp-a"])
  })

  it("falls back to appending when the branch parent is not on the path", () => {
    const optimistic = [ui("tmp-u", "ghost", "user")]
    const out = spliceOptimistic(base, optimistic, "ghost")
    expect(out.map((n) => n.id)).toEqual(["u1", "a1", "u2", "a2", "tmp-u"])
  })
})

describe("editMessage replaces in place immediately (no send-as-new flicker)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("drops the old prompt + old answer the moment the edit is submitted, before any token streams", async () => {
    global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (init?.method === "POST" && u.includes("/api/assistant/chat")) {
        // Freeze the turn mid-flight: the optimistic state must already be
        // correct before a single token arrives.
        return new Promise<Response>(() => {})
      }
      if (u.includes("/api/assistant/chats/")) {
        return {
          ok: true,
          json: async () => ({
            messages: [
              msg("u1", null, "user", "1"),
              msg("a1", "u1", "assistant", "2")
            ]
          })
        } as unknown as Response
      }
      return { ok: false, json: async () => ({}) } as unknown as Response
    }) as typeof fetch

    const { result } = renderHook(() => useAssistantChat("dashboard", null))

    await act(async () => {
      await result.current.loadChat("chat-1")
    })
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.id)).toEqual(["u1", "a1"])
    )

    const userMsg = result.current.messages.find((m) => m.role === "user")
    expect(userMsg).toBeTruthy()

    act(() => {
      result.current.editMessage(userMsg as UiMessage, "edited question")
    })

    // The reported bug: the edit showed up as a NEW message and the old
    // prompt/answer stayed until the reply finished. After the fix, the old
    // ones are gone and the edited prompt is shown right away.
    const contents = result.current.messages.map((m) => m.content)
    expect(result.current.messages.some((m) => m.content === "user:u1")).toBe(false)
    expect(result.current.messages.some((m) => m.content === "assistant:a1")).toBe(false)
    expect(contents).toContain("edited question")
    expect(result.current.streaming).toBe(true)
    expect(result.current.messages).toHaveLength(2) // edited prompt + streaming reply
  })
})
