import { describe, expect, it } from "vitest"

import type { ParsedTurn } from "@relay/shared"

import { filterInsertedContextCapture } from "./inserted-context-capture"

function makeTurn(role: ParsedTurn["role"], content: string, turnIndex: number): ParsedTurn {
  return {
    role,
    content,
    turnIndex,
  }
}

const pending = {
  packetId: "packet-1",
  insertKind: "fresh_chat_bootstrap" as const,
  insertedContent: "Relay brief: Build the extension capture flow and keep context in sync.",
  insertedContentHash: "hash-1",
}

describe("filterInsertedContextCapture", () => {
  it("skips unchanged inserted context plus acknowledgement", () => {
    const result = filterInsertedContextCapture({
      pending,
      turns: [
        makeTurn("user", pending.insertedContent, 0),
        makeTurn("assistant", "Understood. I will use that brief.", 1),
      ],
    })

    expect(result.kind).toBe("skip")
    expect(result.metadata.deltaKind).toBe("unchanged")
    expect(result.metadata.filteredTurnCount).toBe(0)
  })

  it("captures appended user additions without the original inserted brief", () => {
    const result = filterInsertedContextCapture({
      pending,
      turns: [
        makeTurn(
          "user",
          `${pending.insertedContent}\nAlso make the next AI response filter out repeated brief content.`,
          0,
        ),
        makeTurn("assistant", "I will filter repeated brief content and keep only the new response details.", 1),
      ],
    })

    expect(result.kind).toBe("capture")
    if (result.kind !== "capture") return
    expect(result.metadata.deltaKind).toBe("appended")
    expect(result.turns[0]?.content).toContain("Also make the next AI response filter out repeated brief content.")
    expect(result.turns.some((turn) => turn.content.includes(pending.insertedContent))).toBe(false)
  })

  it("captures edited user text in the middle as the new delta", () => {
    const result = filterInsertedContextCapture({
      pending,
      turns: [
        makeTurn(
          "user",
          "Relay brief: Build the browser extension capture flow and keep context in sync.",
          0,
        ),
      ],
    })

    expect(result.kind).toBe("capture")
    if (result.kind !== "capture") return
    expect(result.metadata.deltaKind).toBe("edited")
    expect(result.turns[0]?.content).toContain("browser")
  })

  it("drops assistant repetition while keeping a novel assistant answer", () => {
    const result = filterInsertedContextCapture({
      pending,
      turns: [
        makeTurn(
          "user",
          `${pending.insertedContent}\nAdd handling for continuity insertion too.`,
          0,
        ),
        makeTurn(
          "assistant",
          "You want Relay to build the extension capture flow and keep context in sync.",
          1,
        ),
        makeTurn(
          "assistant",
          "Implementation detail: keep a one-shot pending insertion state and diff the submitted user turn before digesting it.",
          2,
        ),
      ],
    })

    expect(result.kind).toBe("capture")
    if (result.kind !== "capture") return
    expect(result.turns).toHaveLength(2)
    expect(result.turns[1]?.content).toContain("one-shot pending insertion state")
    expect(result.metadata.assistantOutcome).toBe("kept_novel")
  })

  it("keeps assistant-only novel output when the user submitted the inserted brief unchanged", () => {
    const result = filterInsertedContextCapture({
      pending,
      turns: [
        makeTurn("user", pending.insertedContent, 0),
        makeTurn(
          "assistant",
          "New risk: route the skipped insert case into a saved local association or future turns will re-enter generic project routing.",
          1,
        ),
      ],
    })

    expect(result.kind).toBe("capture")
    if (result.kind !== "capture") return
    expect(result.metadata.deltaKind).toBe("assistant_only")
    expect(result.turns).toHaveLength(1)
    expect(result.turns[0]?.role).toBe("assistant")
  })

  it("applies the same filtering to quick continuity insertions", () => {
    const result = filterInsertedContextCapture({
      pending: {
        ...pending,
        insertKind: "quick_continuity",
        insertedContent: "Continuity brief: keep working on the extension capture filter.",
      },
      turns: [
        makeTurn(
          "user",
          "Continuity brief: keep working on the extension capture filter. Also make the skip case preserve chat association.",
          0,
        ),
        makeTurn("assistant", "Understood. I will keep working on the extension capture filter.", 1),
      ],
    })

    expect(result.kind).toBe("capture")
    if (result.kind !== "capture") return
    expect(result.metadata.deltaKind).toBe("appended")
    expect(result.turns).toHaveLength(1)
    expect(result.turns[0]?.content).toContain("preserve chat association")
  })
})
