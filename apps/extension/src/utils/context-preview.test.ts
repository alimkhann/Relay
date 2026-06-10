import { describe, expect, it } from "vitest"

import type { RelayContextPreview, RelayContextNoteItem } from "../messaging/contracts"
import { preferContextPreviewOnSync } from "./context-preview"

function note(memoryId: string, text: string): RelayContextNoteItem {
  return {
    key: `note:${memoryId}`,
    memoryId,
    text,
    sourceUrl: null,
    hostname: null,
    capturedAt: "2026-01-01T00:00:00.000Z",
  }
}

function preview(notes: RelayContextNoteItem[]): RelayContextPreview {
  return {
    decisions: [],
    constraints: [],
    tasks: [],
    notes,
    requirements: [],
  }
}

describe("preferContextPreviewOnSync", () => {
  it("keeps the slimmer local preview when sync reintroduces deleted rows", () => {
    const current = preview([note("m1", "stay")])
    const next = preview([note("m1", "stay"), note("m2", "gone")])

    expect(preferContextPreviewOnSync(current, next)).toBe(current)
  })

  it("prefers the richer local preview when sync is missing new rows", () => {
    const current = preview([note("m1", "one"), note("m2", "two")])
    const next = preview([note("m1", "one")])

    expect(preferContextPreviewOnSync(current, next)).toBe(current)
  })
})