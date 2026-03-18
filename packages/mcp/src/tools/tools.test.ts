import { describe, it, expect, vi } from "vitest"
import type { RelayClient } from "../client.js"
import { listProjects } from "./list-projects.js"
import { getBrief } from "./get-brief.js"
import { getProjectState } from "./get-project-state.js"
import { searchContext } from "./search-context.js"
import { addMemory } from "./add-memory.js"
import { saveContext } from "./save-context.js"
import { manageMemory } from "./manage-memory.js"

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    get: vi.fn().mockImplementation((path: string) => {
      if (path === "/api/projects") {
        return Promise.resolve({
          projects: [
            {
              id: "proj-1",
              name: "Test Project",
              slug: "test-project",
              description: "A test project",
              memoryCount: 5,
              sessionCount: 3,
              routingContext: { hasMeaningfulContext: true, keywords: ["test"] },
              updatedAt: "2026-01-01T00:00:00Z"
            }
          ]
        })
      }
      if (path.includes("/memory/search")) {
        // Simulate server-side search not available (forces fallback)
        return Promise.reject(new Error("404 Not Found"))
      }
      if (path.includes("/memory")) {
        return Promise.resolve({
          memory: [
            { id: "mem-1", type: "decision", title: "Use React", content: "We chose React for the frontend", pinned: false, updatedAt: "2026-01-01T00:00:00Z" },
            { id: "mem-2", type: "constraint", title: null, content: "Must support IE11", pinned: true, updatedAt: "2026-01-01T00:00:00Z" },
            { id: "mem-3", type: "note", title: "API Design", content: "REST over GraphQL", pinned: false, updatedAt: "2026-01-01T00:00:00Z" }
          ]
        })
      }
      if (path.includes("/bootstrap/latest")) {
        return Promise.resolve({
          packet: { content: "# Project Brief\n\nThis is the brief." }
        })
      }
      if (path.match(/\/api\/projects\/[^/]+$/)) {
        return Promise.resolve({
          project: { id: "proj-1", name: "Test Project", slug: "test-project", description: null },
          dashboard: {
            projectState: { projectOverview: "A test project", decisions: ["Use React"], constraints: ["IE11"], openTasks: [], dirty: false, updatedAt: "2026-01-01T00:00:00Z" },
            derivedProjectState: null,
            stateOverrides: null,
            stateStatus: { projectStateReady: true },
            memory: [
              { id: "mem-1", type: "decision", title: "Use React", content: "We chose React", pinned: false, updatedAt: "2026-01-01T00:00:00Z" }
            ]
          }
        })
      }
      return Promise.resolve({})
    }),
    post: vi.fn().mockResolvedValue({
      status: "ready",
      packet: { id: "pkt-1", kind: "fresh_chat_bootstrap", content: "# Generated Brief", targetProfileKey: "claude_code_build", createdAt: "2026-01-01T00:00:00Z" },
      item: { id: "mem-new", type: "note", title: null, content: "test" }
    }),
    patch: vi.fn().mockResolvedValue({
      item: { id: "mem-1", type: "decision", title: "Use Vue", content: "Switched to Vue", pinned: false, updatedAt: "2026-01-02T00:00:00Z" }
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as RelayClient
}

describe("relay_list_projects", () => {
  it("returns formatted project list", async () => {
    const client = mockClient()
    const result = await listProjects(client)

    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe("Test Project")
    expect(parsed[0].keywords).toEqual(["test"])
  })
})

describe("relay_get_brief", () => {
  it("generates a new brief", async () => {
    const client = mockClient()
    const result = await getBrief(
      client,
      { kind: "fresh_chat_bootstrap", targetProfileKey: "claude_code_build", generate: true },
      "proj-1"
    )

    expect(result.content[0]!.text).toBe("# Generated Brief")
    expect(client.post).toHaveBeenCalledWith("/api/projects/proj-1/bootstrap", {
      targetProfileKey: "claude_code_build",
      kind: "fresh_chat_bootstrap"
    })
  })

  it("fetches cached brief when generate=false", async () => {
    const client = mockClient()
    const result = await getBrief(
      client,
      { kind: "fresh_chat_bootstrap", targetProfileKey: "claude_code_build", generate: false },
      "proj-1"
    )

    expect(result.content[0]!.text).toBe("# Project Brief\n\nThis is the brief.")
    expect(client.get).toHaveBeenCalled()
  })

  it("handles pending brief generation", async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: "pending", packet: null, reason: "Digest in progress" })
    })
    const result = await getBrief(
      client,
      { kind: "fresh_chat_bootstrap", targetProfileKey: "claude_code_build", generate: true },
      "proj-1"
    )

    expect(result.content[0]!.text).toContain("in progress")
  })
})

describe("relay_get_project_state", () => {
  it("returns structured project state with grouped memory", async () => {
    const client = mockClient()
    const result = await getProjectState(client, "proj-1")

    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed.project.name).toBe("Test Project")
    expect(parsed.memory.decision).toHaveLength(1)
  })
})

describe("relay_search_context", () => {
  it("filters memory by keyword", async () => {
    const client = mockClient()
    const result = await searchContext(
      client,
      { query: "react" },
      "proj-1"
    )

    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe("mem-1")
  })

  it("filters by type", async () => {
    const client = mockClient()
    const result = await searchContext(
      client,
      { query: "must", types: ["constraint"] },
      "proj-1"
    )

    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].type).toBe("constraint")
  })

  it("returns message when no results found", async () => {
    const client = mockClient()
    const result = await searchContext(
      client,
      { query: "nonexistent" },
      "proj-1"
    )

    expect(result.content[0]!.text).toContain("No memory items found")
  })
})

describe("relay_add_memory", () => {
  it("creates a memory item with source metadata", async () => {
    const client = mockClient()
    await addMemory(
      client,
      { type: "decision", content: "Use TypeScript everywhere", title: "TypeScript adoption" },
      "proj-1"
    )

    expect(client.post).toHaveBeenCalledWith("/api/projects/proj-1/memory",
      expect.objectContaining({
        projectId: "proj-1",
        type: "decision",
        content: "Use TypeScript everywhere",
        title: "TypeScript adoption",
        pinned: false,
        tags: [],
        metadata: { source: "mcp" },
        sourceSurface: "mcp",
      })
    )
  })
})

describe("relay_save_context", () => {
  it("creates multiple memory items via batch endpoint", async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({
        items: [
          { id: "m1", type: "note", title: "IDE Session Summary" },
          { id: "m2", type: "note", title: "Session Progress" },
          { id: "m3", type: "decision", title: null },
          { id: "m4", type: "constraint", title: null },
          { id: "m5", type: "task", title: null },
          { id: "m6", type: "note", title: null }
        ]
      })
    })
    const result = await saveContext(
      client,
      {
        summary: "Implemented auth flow",
        decisions: ["Use JWT tokens"],
        progress: "Auth endpoints done",
        nextSteps: ["Add refresh tokens"],
        constraints: ["Must support SSO"],
        notes: ["Check OAuth2 spec"]
      },
      "proj-1"
    )

    // Single batch call
    expect(client.post).toHaveBeenCalledTimes(1)
    expect(client.post).toHaveBeenCalledWith(
      "/api/projects/proj-1/memory/batch",
      expect.objectContaining({ items: expect.any(Array) })
    )
    expect(result.content[0]!.text).toContain("Saved 6 context items")
  })

  it("falls back to sequential creation if batch fails", async () => {
    const postFn = vi.fn()
      .mockRejectedValueOnce(new Error("404 Not Found"))
      .mockResolvedValue({ item: { id: "m1", type: "note" } })
    const client = mockClient({ post: postFn })
    const result = await saveContext(
      client,
      { summary: "Quick session" },
      "proj-1"
    )

    // 1 batch attempt + 1 sequential fallback
    expect(postFn).toHaveBeenCalledTimes(2)
    expect(result.content[0]!.text).toContain("Saved 1 context items")
  })
})

describe("relay_manage_memory", () => {
  it("updates a memory item", async () => {
    const client = mockClient()
    const result = await manageMemory(client, {
      action: "update",
      memoryId: "mem-1",
      content: "Switched to Vue",
      title: "Use Vue"
    })

    expect(client.patch).toHaveBeenCalledWith("/api/memory/mem-1", {
      content: "Switched to Vue",
      title: "Use Vue"
    })
    expect(result.content[0]!.text).toContain("updated")
    expect(result.content[0]!.text).toContain("Use Vue")
  })

  it("deletes multiple memory items", async () => {
    const client = mockClient()
    const result = await manageMemory(client, {
      action: "delete",
      memoryId: ["mem-1", "mem-2"]
    })

    expect(client.delete).toHaveBeenCalledTimes(2)
    expect(result.content[0]!.text).toContain("Deleted 2")
  })

  it("reports partial delete failures", async () => {
    const client = mockClient({
      delete: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Not found"))
    })
    const result = await manageMemory(client, {
      action: "delete",
      memoryId: ["mem-1", "mem-2"]
    })

    expect(result.content[0]!.text).toContain("Deleted 1")
    expect(result.content[0]!.text).toContain("Failed to delete 1")
  })

  it("archives memory items", async () => {
    const client = mockClient()
    const result = await manageMemory(client, {
      action: "archive",
      memoryId: ["mem-1"]
    })

    expect(client.patch).toHaveBeenCalledWith("/api/memory/mem-1", { isArchived: true })
    expect(result.content[0]!.text).toContain("Archived 1")
  })
})
