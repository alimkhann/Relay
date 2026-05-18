import { describe, expect, it } from "vitest"

import type { AssistantMessageDto } from "@relay/shared"

import { derivePath } from "./use-assistant-chat"

function msg(
  id: string,
  parentId: string | null,
  role: "user" | "assistant",
  createdAt: string
): AssistantMessageDto {
  return { id, parentId, role, content: `${role}:${id}`, toolName: null, actionResult: null, feedback: null, createdAt }
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
