import { beforeEach, describe, expect, it, vi } from "vitest"

import type { MemoryItemRow, SessionDigestShape } from "@relay/shared"

const { emitMemoryEventMock } = vi.hoisted(() => ({
  emitMemoryEventMock: vi.fn(),
}))

vi.mock("./memory-service", () => ({
  emitMemoryEvent: emitMemoryEventMock,
}))

import { reconcileAfterDigest } from "./context-reconciliation-service"

const now = "2026-04-24T00:00:00.000Z"

function makeMemory(overrides: Partial<MemoryItemRow>): MemoryItemRow {
  return {
    id: "memory-1",
    projectId: "project-1",
    sourceTurnId: null,
    type: "decision",
    title: null,
    content: "Use Google-only sign-in.",
    pinned: false,
    isArchived: false,
    sortOrder: null,
    tags: [],
    metadata: {},
    createdBy: "user-1",
    createdAt: now,
    updatedAt: now,
    sourceSurface: "web",
    sourceConversationId: null,
    sourceUrl: null,
    capturedAt: now,
    derivedFrom: null,
    embedding: null,
    embeddingModel: null,
    forgetAfter: null,
    lastReaffirmedAt: null,
    ...overrides,
  }
}

const emptyDigest: SessionDigestShape = {
  summaryShort: "Update",
  newDecisions: [],
  newConstraints: [],
  newTasks: [],
  projectOverviewDelta: null,
  currentObjectiveDelta: null,
  recentProgressDelta: null,
  relevantToolsDelta: [],
  importanceScore: 80,
  shouldMerge: true,
}

describe("reconcileAfterDigest truth maintenance", () => {
  beforeEach(() => {
    emitMemoryEventMock.mockReset()
  })

  it("archives explicit truth-maintenance decisions and protects pinned items", async () => {
    const updateMock = vi.fn(async () => makeMemory({ id: "old" }))
    const repositories = {
      memory: {
        listByProject: vi.fn(async () => [
          makeMemory({ id: "old", content: "Use Google-only sign-in." }),
          makeMemory({ id: "pinned", content: "Keep this pinned.", pinned: true }),
        ]),
        update: updateMock,
        reaffirm: vi.fn(),
        addRelation: vi.fn(),
      },
    }

    const result = await reconcileAfterDigest(repositories as any, "project-1", emptyDigest, {
      userId: "user-1",
      sourceSurface: "web",
      truthMaintenanceArchive: [
        { id: "old", reason: "Email sign-in supersedes Google-only auth." },
        { id: "pinned", reason: "Should not archive pinned memory." },
      ],
    })

    expect(result.archivedCount).toBe(1)
    expect(result.archivedItems).toEqual(["Use Google-only sign-in."])
    expect(updateMock).toHaveBeenCalledWith("old", {
      isArchived: true,
      metadata: {
        archivedBy: "truth_maintenance",
        archivedReason: "Email sign-in supersedes Google-only auth.",
        conflictStatus: "superseded",
        validationState: "superseded",
      },
    })
    expect(updateMock).not.toHaveBeenCalledWith("pinned", expect.anything())
    expect(emitMemoryEventMock).toHaveBeenCalledWith(
      repositories,
      expect.objectContaining({
        memoryItemId: "old",
        eventType: "archived",
        payload: expect.objectContaining({ reason: "Email sign-in supersedes Google-only auth." }),
      }),
    )
  })
})
