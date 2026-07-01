import { afterEach, describe, expect, it, vi } from "vitest"

import type { MemoryItemRow, ProjectRow } from "@relay/shared"
import type { runGeminiJsonWithFallback } from "./gemini-service"

const listByOwnerMock = vi.fn()
const listPersonalItemsMissingCategoryMock = vi.fn()
const listAgentNoteTypeBackfillCandidatesMock = vi.fn()
const updateMemoryItemMock = vi.fn()
const refinePersonalCategoryMock = vi.fn()
const regeneratePersonalStateMock = vi.fn()

vi.mock("@relay/db", () => ({
  createRepositoryBundle: () => ({
    projects: {
      listByOwner: listByOwnerMock,
    },
    memory: {
      listPersonalItemsMissingCategory: listPersonalItemsMissingCategoryMock,
      listAgentNoteTypeBackfillCandidates: listAgentNoteTypeBackfillCandidatesMock,
    },
  }),
}))

vi.mock("./memory-service", () => ({
  updateMemoryItem: (...args: unknown[]) => updateMemoryItemMock(...args),
}))

vi.mock("./personal-memory-service", () => ({
  refinePersonalCategory: (...args: unknown[]) => refinePersonalCategoryMock(...args),
  regeneratePersonalState: (...args: unknown[]) => regeneratePersonalStateMock(...args),
}))

import {
  backfillMemoryTaxonomyForUser,
  classifyProjectMemoryType,
} from "./memory-taxonomy-backfill-service"

const ALLOW_GATE = {
  shouldRun: () => true,
  record: () => {},
  snapshot: () => ({ capUsd: 5, spentUsd: 0, resetAt: new Date() }),
}

function makeProject(overrides: Partial<ProjectRow>): ProjectRow {
  return {
    id: "proj-1",
    ownerId: "u1",
    name: "Project",
    slug: "project",
    description: null,
    projectUrl: null,
    isArchived: false,
    kind: "project",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function makeMemory(overrides: Partial<MemoryItemRow>): MemoryItemRow {
  return {
    id: "mem-1",
    projectId: "proj-1",
    sourceTurnId: null,
    type: "note",
    title: null,
    content: "Remember this.",
    pinned: false,
    isArchived: false,
    sortOrder: null,
    tags: [],
    metadata: {},
    createdBy: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sourceSurface: "mcp",
    sourceConversationId: null,
    sourceUrl: null,
    capturedAt: null,
    derivedFrom: null,
    embedding: null,
    embeddingModel: null,
    forgetAfter: null,
    lastReaffirmedAt: null,
    lifecycleState: "active",
    ...overrides,
  }
}

function fakeRunJson(type: string): typeof runGeminiJsonWithFallback {
  return vi.fn(async () => ({
    data: { type } as never,
    primaryModel: "m",
    actualModel: "m",
    fallbackUsed: false,
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  })) as unknown as typeof runGeminiJsonWithFallback
}

describe("classifyProjectMemoryType", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns a valid model-selected project memory type", async () => {
    const type = await classifyProjectMemoryType(
      makeMemory({ title: "Auth decision", content: "Decision: use Clerk for auth." }),
      { runJson: fakeRunJson("decision"), gate: ALLOW_GATE },
    )

    expect(type).toBe("decision")
  })

  it("falls back to note for unknown model output", async () => {
    const type = await classifyProjectMemoryType(
      makeMemory({ content: "Some context." }),
      { runJson: fakeRunJson("bogus"), gate: ALLOW_GATE },
    )

    expect(type).toBe("note")
  })
})

describe("backfillMemoryTaxonomyForUser", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("walks the signed-in user's Personal project and regular projects", async () => {
    const personal = makeProject({ id: "personal-1", kind: "personal", name: "Personal" })
    const project = makeProject({ id: "proj-1", kind: "project" })
    const personalItem = makeMemory({ id: "personal-mem", projectId: personal.id, content: "User prefers TypeScript." })
    const decisionItem = makeMemory({ id: "decision-mem", projectId: project.id, content: "Decision: keep Fluid Compute disabled." })
    const noteItem = makeMemory({ id: "note-mem", projectId: project.id, content: "General context about the project." })
    const runJson = vi
      .fn()
      .mockResolvedValueOnce({ data: { type: "decision" }, primaryModel: "m", actualModel: "m", fallbackUsed: false, tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } })
      .mockResolvedValueOnce({ data: { type: "note" }, primaryModel: "m", actualModel: "m", fallbackUsed: false, tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }) as unknown as typeof runGeminiJsonWithFallback

    listByOwnerMock.mockResolvedValue([personal, project])
    listPersonalItemsMissingCategoryMock.mockResolvedValue([personalItem])
    listAgentNoteTypeBackfillCandidatesMock.mockResolvedValue([decisionItem, noteItem])
    refinePersonalCategoryMock.mockResolvedValue(true)
    updateMemoryItemMock.mockImplementation(async () => null)

    const result = await backfillMemoryTaxonomyForUser("u1", {
      limit: 10,
      classifyDeps: { runJson, gate: ALLOW_GATE },
    })

    expect(listByOwnerMock).toHaveBeenCalledWith("u1", { includePersonal: true })
    expect(listPersonalItemsMissingCategoryMock).toHaveBeenCalledWith("personal-1", 5)
    expect(listAgentNoteTypeBackfillCandidatesMock).toHaveBeenCalledWith("proj-1", 5)
    expect(refinePersonalCategoryMock).toHaveBeenCalledWith("u1", personalItem)
    expect(updateMemoryItemMock).toHaveBeenCalledWith("u1", "decision-mem", expect.objectContaining({ type: "decision" }), "proj-1")
    expect(updateMemoryItemMock).toHaveBeenCalledWith("u1", "note-mem", expect.objectContaining({ type: "note" }), "proj-1")
    expect(regeneratePersonalStateMock).toHaveBeenCalledWith("u1")
    expect(result.personal).toEqual({ scanned: 1, categorized: 1 })
    expect(result.projectTypes).toEqual({ scanned: 2, retagged: 1, keptNote: 1 })
  })
})
