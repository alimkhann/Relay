import { describe, expect, it } from "vitest"

import { buildDashboardContextPreview, buildTrustMetadata } from "./context-preview"
import type { ProjectDashboardPayload } from "./bg-types"

function dashboard(overrides: Partial<ProjectDashboardPayload> = {}): ProjectDashboardPayload {
  return {
    project: { id: "p1", name: "Relay", kind: "project" },
    projectState: null,
    stateStatus: null,
    packets: [],
    memory: [],
    sessionHistory: [],
    distinctConversationCount: 0,
    ...overrides,
  } as unknown as ProjectDashboardPayload
}

describe("buildDashboardContextPreview", () => {
  it("returns an empty preview when there is no dashboard", () => {
    expect(buildDashboardContextPreview(null)).toEqual({
      decisions: [],
      constraints: [],
      tasks: [],
      notes: [],
      requirements: [],
    })
  })

  it("shows only pinned notes for a regular project, capped at 5", () => {
    const memory = Array.from({ length: 8 }, (_, i) => ({
      id: `n${i}`,
      type: "note",
      content: `note ${i}`,
      pinned: i < 7,
      sourceUrl: null,
      sourceSurface: null,
      capturedAt: `2026-01-0${(i % 9) + 1}T00:00:00.000Z`,
      updatedAt: "2026-01-01T00:00:00.000Z",
      metadata: null,
    }))
    const preview = buildDashboardContextPreview(
      dashboard({ memory: memory as unknown as ProjectDashboardPayload["memory"] }),
    )
    expect(preview.notes.length).toBe(5)
  })

  it("shows all notes for a personal project (up to 200), including unpinned", () => {
    const memory = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`,
      type: "note",
      content: `note ${i}`,
      pinned: false,
      sourceUrl: null,
      sourceSurface: null,
      capturedAt: `2026-01-01T00:00:0${i % 10}.000Z`,
      updatedAt: "2026-01-01T00:00:00.000Z",
      metadata: null,
    }))
    const preview = buildDashboardContextPreview(
      dashboard({
        project: { id: "p1", name: "Personal", kind: "personal" } as ProjectDashboardPayload["project"],
        memory: memory as unknown as ProjectDashboardPayload["memory"],
      }),
    )
    expect(preview.notes.length).toBe(12)
  })
})

describe("buildTrustMetadata", () => {
  it("returns zeroed metadata for a null dashboard", () => {
    expect(buildTrustMetadata(null)).toEqual({
      updatedAt: null,
      updatedLabel: null,
      recentChatCount: 0,
      savedContextCount: 0,
    })
  })

  it("picks the most recent timestamp candidate", () => {
    const meta = buildTrustMetadata(
      dashboard({
        projectState: { updatedAt: "2026-01-01T00:00:00.000Z" } as ProjectDashboardPayload["projectState"],
        stateStatus: { lastDigestAt: "2026-03-01T00:00:00.000Z" } as ProjectDashboardPayload["stateStatus"],
        distinctConversationCount: 4,
      }),
    )
    expect(meta.updatedAt).toBe("2026-03-01T00:00:00.000Z")
    expect(meta.recentChatCount).toBe(4)
  })
})
