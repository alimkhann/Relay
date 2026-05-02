import { describe, it, expect, vi } from "vitest"
import type { RelayClient } from "../client.js"
import { listProjects } from "./list-projects.js"
import { getBrief } from "./get-brief.js"
import { getProjectState } from "./get-project-state.js"
import { listMemory } from "./list-memory.js"
import { getMemory } from "./get-memory.js"
import { searchContext } from "./search-context.js"
import { listSessions } from "./list-sessions.js"
import { archiveSession } from "./archive-session.js"
import { listBriefs } from "./list-briefs.js"
import { regenerateBrief } from "./regenerate-brief.js"
import { deleteBrief } from "./delete-brief.js"
import { traceContextSources } from "./trace-context-sources.js"
import { listRecentActivity } from "./list-recent-activity.js"
import { addMemory } from "./add-memory.js"
import { saveContext } from "./save-context.js"
import { manageMemory } from "./manage-memory.js"

function getBriefStatus(result: { structuredContent?: unknown }) {
  const structured = result.structuredContent as { brief?: { status?: string } } | undefined
  return structured?.brief?.status
}

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
      if (path === "/api/memory/mem-1") {
        return Promise.resolve({
          item: {
            id: "mem-1",
            type: "decision",
            title: "Use React",
            content: "We chose React for the frontend",
            provenance: { sourceSurface: "mcp" },
            status: { conflictStatus: null },
            relations: [{ relationType: "supersedes", otherMemoryId: "mem-0" }],
          }
        })
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
      if (path.includes("/bootstrap?")) {
        return Promise.resolve({
          packets: [
            {
              id: "pkt-1",
              kind: "fresh_chat_bootstrap",
              targetProfileKey: "claude_code_build",
              renderer: "gemini",
              createdAt: "2026-01-01T00:00:00Z",
            }
          ]
        })
      }
      if (path.includes("/sessions")) {
        return Promise.resolve({
          groupedSessions: [{ conversationId: "conv-1", captureCount: 2 }],
          sourceSessions: [{ id: "sess-1", platform: "chatgpt", title: "Relay work" }],
          workSessions: [{ id: "ws-1", surface: "mcp", status: "active" }],
        })
      }
      if (path.includes("/trace?")) {
        return Promise.resolve({
          trace: {
            query: "react",
            memory: [{ id: "mem-1" }],
            digests: [{ id: "dig-1" }],
            briefs: [{ id: "pkt-1" }],
          }
        })
      }
      if (path.includes("/activity?mode=continuity")) {
        return Promise.resolve({
          activity: [{ kind: "digest_created", sourceId: "dig-1" }]
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
    getDefaultSince: vi.fn().mockResolvedValue(undefined),
    post: vi.fn().mockResolvedValue({
      status: "ready",
      packet: { id: "pkt-1", kind: "fresh_chat_bootstrap", content: "# Generated Brief", targetProfileKey: "claude_code_build", createdAt: "2026-01-01T00:00:00Z" },
      item: { id: "mem-new", type: "note", title: null, content: "test" }
    }),
    getDefaultSyncSurface: vi.fn().mockReturnValue("mcp"),
    getDefaultTargetProfileKey: vi.fn().mockReturnValue("chatgpt_planning"),
    patch: vi.fn().mockImplementation((path: string) => {
      if (path.includes("/sessions/")) {
        return Promise.resolve({
          session: { id: "11111111-1111-1111-1111-111111111111", archived: true, title: "Relay work" }
        })
      }
      return Promise.resolve({
        item: { id: "mem-1", type: "decision", title: "Use Vue", content: "Switched to Vue", pinned: false, updatedAt: "2026-01-02T00:00:00Z" }
      })
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as RelayClient
}

describe("list_projects", () => {
  it("returns formatted project list", async () => {
    const client = mockClient()
    const result = await listProjects(client, "proj-1")

    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe("Test Project")
    expect(parsed[0].keywords).toEqual(["test"])
    expect(parsed[0].isCurrent).toBe(true)
  })
})

describe("get_brief", () => {
  it("defaults to quick continuity when the project is warm and clean", async () => {
    const client = mockClient({
      getDefaultSince: vi.fn().mockResolvedValue("2026-01-01T00:00:00.000Z"),
    })

    await getBrief(
      client,
      { targetProfileKey: "claude_code_build", generate: true, syncSurface: "mcp" },
      "proj-1"
    )

    expect(client.post).toHaveBeenCalledWith("/api/projects/proj-1/bootstrap", {
      targetProfileKey: "claude_code_build",
      kind: "quick_continuity",
      since: "2026-01-01T00:00:00.000Z",
      syncSurface: "mcp"
    })
  })

  it("uses the client default target profile when none is provided", async () => {
    const client = mockClient({
      getDefaultTargetProfileKey: vi.fn().mockReturnValue("codex_implementation"),
    })

    await getBrief(
      client,
      { generate: true, syncSurface: "codex" },
      "proj-1",
    )

    expect(client.post).toHaveBeenCalledWith("/api/projects/proj-1/bootstrap", {
      targetProfileKey: "codex_implementation",
      kind: "fresh_chat_bootstrap",
      since: undefined,
      syncSurface: "codex",
    })
  })

  it("generates a new brief", async () => {
    const client = mockClient()
    const result = await getBrief(
      client,
      { kind: "fresh_chat_bootstrap", targetProfileKey: "claude_code_build", generate: true, syncSurface: "mcp" },
      "proj-1"
    )

    expect(result.content[0]!.text).toBe("# Generated Brief")
    expect(getBriefStatus(result)).toBe("ready")
    expect(client.post).toHaveBeenCalledWith("/api/projects/proj-1/bootstrap", {
      targetProfileKey: "claude_code_build",
      kind: "fresh_chat_bootstrap",
      since: undefined,
      syncSurface: "mcp"
    })
  })

  it("fetches cached brief when generate=false", async () => {
    const client = mockClient()
    const result = await getBrief(
      client,
      { kind: "fresh_chat_bootstrap", targetProfileKey: "claude_code_build", generate: false, syncSurface: "mcp" },
      "proj-1"
    )

    expect(result.content[0]!.text).toBe("# Project Brief\n\nThis is the brief.")
    expect(getBriefStatus(result)).toBe("ready")
    expect(client.get).toHaveBeenCalled()
  })

  it("handles pending brief generation", async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ status: "pending", packet: null, reason: "Digest in progress" })
    })
    const result = await getBrief(
      client,
      { kind: "fresh_chat_bootstrap", targetProfileKey: "claude_code_build", generate: true, syncSurface: "mcp" },
      "proj-1"
    )

    expect(result.content[0]!.text).toContain("in progress")
    expect(getBriefStatus(result)).toBe("pending")
  })
})

describe("get_project_state", () => {
  it("returns structured project state with grouped memory", async () => {
    const client = mockClient()
    const result = await getProjectState(client, "proj-1")

    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed.project.name).toBe("Test Project")
    expect(parsed.memory.decision).toHaveLength(1)
  })
})

describe("list_memory", () => {
  it("returns filtered memory inventory", async () => {
    const client = mockClient()
    const result = await listMemory(client, { archived: true, types: ["decision"] }, "proj-1")
    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed[0].id).toBe("mem-1")
    expect(client.get).toHaveBeenCalledWith("/api/projects/proj-1/memory?archived=true&type=decision")
  })

  it("falls back to dashboard memory if the explainability endpoint errors", async () => {
    const client = mockClient({
      get: vi.fn().mockImplementation((path: string) => {
        if (path === "/api/projects/proj-1/memory") {
          return Promise.reject(new Error("500 Internal Server Error"))
        }
        if (path === "/api/projects/proj-1") {
          return Promise.resolve({
            dashboard: {
              memory: [
                { id: "mem-1", type: "decision", title: "Use React", content: "We chose React", pinned: false, updatedAt: "2026-01-01T00:00:00Z", tags: ["frontend"] },
              ],
            },
          })
        }
        return Promise.resolve({})
      }),
    })

    const result = await listMemory(client, {}, "proj-1")
    const parsed = JSON.parse(result.content[0]!.text)

    expect(parsed[0].id).toBe("mem-1")
    expect(client.get).toHaveBeenCalledWith("/api/projects/proj-1")
  })
})

describe("get_memory", () => {
  it("returns one memory item with provenance and relations", async () => {
    const client = mockClient()
    const result = await getMemory(client, { memoryId: "mem-1" })
    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed.id).toBe("mem-1")
    expect(parsed.relations).toHaveLength(1)
  })
})

describe("search_context", () => {
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

describe("sessions and briefs explainability tools", () => {
  it("lists sessions influencing continuity", async () => {
    const client = mockClient()
    const result = await listSessions(client, { includeArchived: true }, "proj-1")
    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed.groupedSessions).toHaveLength(1)
    expect(parsed.workSessions[0].id).toBe("ws-1")
  })

  it("archives a source session", async () => {
    const client = mockClient()
    const result = await archiveSession(client, { sessionId: "11111111-1111-1111-1111-111111111111", archived: true }, "proj-1")
    expect(client.patch).toHaveBeenCalledWith(
      "/api/projects/proj-1/sessions/11111111-1111-1111-1111-111111111111",
      { archived: true }
    )
    expect(result.content[0]!.text).toContain("Relay work")
  })

  it("lists briefs", async () => {
    const client = mockClient()
    const result = await listBriefs(client, { limit: 10 }, "proj-1")
    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed[0].id).toBe("pkt-1")
  })

  it("regenerates a brief", async () => {
    const client = mockClient()
    const result = await regenerateBrief(client, { targetProfileKey: "claude_code_build", kind: "fresh_chat_bootstrap" }, "proj-1")
    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed.packet.id).toBe("pkt-1")
  })

  it("deletes a brief packet", async () => {
    const client = mockClient()
    const result = await deleteBrief(client, { packetId: "11111111-1111-1111-1111-111111111111" }, "proj-1")
    expect(client.delete).toHaveBeenCalledWith(
      "/api/projects/proj-1/bootstrap?packetId=11111111-1111-1111-1111-111111111111"
    )
    expect(result.content[0]!.text).toContain("11111111-1111-1111-1111-111111111111")
  })
})

describe("trace_context_sources and list_recent_activity", () => {
  it("traces likely source families for a phrase", async () => {
    const client = mockClient()
    const result = await traceContextSources(client, { query: "react" }, "proj-1")
    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed.memory[0].id).toBe("mem-1")
    expect(parsed.digests[0].id).toBe("dig-1")
  })

  it("lists recent continuity activity", async () => {
    const client = mockClient()
    const result = await listRecentActivity(client, { limit: 5 }, "proj-1")
    const parsed = JSON.parse(result.content[0]!.text)
    expect(parsed[0].kind).toBe("digest_created")
  })
})

describe("add_memory", () => {
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
        metadata: expect.objectContaining({ source: "mcp" }),
        sourceSurface: "mcp",
      })
    )
  })
})

describe("save_context", () => {
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

    // Legacy path: batch call + mcp-state fallback
    expect(client.post).toHaveBeenCalledTimes(2)
    expect(client.post).toHaveBeenCalledWith(
      "/api/projects/proj-1/memory/batch",
      expect.objectContaining({ items: expect.any(Array) })
    )
    expect(client.post).toHaveBeenCalledWith(
      "/api/projects/proj-1/mcp-state",
      expect.objectContaining({ replaceLists: false })
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

    // 1 batch attempt (fail) + 1 sequential fallback + 1 mcp-state fallback
    expect(postFn).toHaveBeenCalledTimes(3)
    expect(result.content[0]!.text).toContain("Saved 1 context items")
  })
})

describe("manage_memory", () => {
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
