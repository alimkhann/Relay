import { describe, expect, it, vi } from "vitest"
import { registerTools } from "./register.js"

function createServerHarness() {
  const registrations: Array<{
    name: string
    description: string
    schema: unknown
    handler: (args: Record<string, unknown>) => Promise<unknown>
  }> = []

  return {
    registrations,
    server: {
      tool(name: string, description: string, schema: unknown, maybeHandler: unknown, maybeFinalHandler?: unknown) {
        const handler = (typeof maybeFinalHandler === "function" ? maybeFinalHandler : maybeHandler) as (args: Record<string, unknown>) => Promise<unknown>
        registrations.push({ name, description, schema, handler })
      },
    },
  }
}

describe("registerTools analytics wrapper", () => {
  it("guides agents to save confirmed findings after empty recall and manual investigation", () => {
    const harness = createServerHarness()
    const client = {
      captureAnalytics: vi.fn(),
      getAgentName: vi.fn().mockReturnValue("codex"),
      getClientName: vi.fn().mockReturnValue("relay-mcp:codex"),
    }

    registerTools(harness.server as never, {
      client: client as never,
      resolveProjectId: vi.fn(async (projectId?: string) => projectId ?? "proj-1"),
      resolveProjectSelection: undefined,
      getCachedProjectId: () => "proj-1",
      setCachedProjectId: vi.fn(),
    })

    const recall = harness.registrations.find((tool) => tool.name === "recall")

    expect(recall?.description).toContain("save what you confirm")
    expect(recall?.description).toContain("stale, completed, contradicted, or superseded")
  })

  it("registers only the compact public MCP surface", () => {
    const harness = createServerHarness()
    const client = {
      captureAnalytics: vi.fn(),
      getAgentName: vi.fn().mockReturnValue("codex"),
      getClientName: vi.fn().mockReturnValue("relay-mcp:codex"),
    }

    registerTools(harness.server as never, {
      client: client as never,
      resolveProjectId: vi.fn(async (projectId?: string) => projectId ?? "proj-1"),
      resolveProjectSelection: undefined,
      getCachedProjectId: () => "proj-1",
      setCachedProjectId: vi.fn(),
    })

    expect(harness.registrations.map((tool) => tool.name)).toEqual([
      "list_projects",
      "set_current_project",
      "get_brief",
      "recall",
      "sources",
      "save",
    ])
  })

  it("registers sources as one action-based external source tool", () => {
    const harness = createServerHarness()
    const client = {
      captureAnalytics: vi.fn(),
      getAgentName: vi.fn().mockReturnValue("codex"),
      getClientName: vi.fn().mockReturnValue("relay-mcp:codex"),
    }

    registerTools(harness.server as never, {
      client: client as never,
      resolveProjectId: vi.fn(async (projectId?: string) => projectId ?? "proj-1"),
      resolveProjectSelection: undefined,
      getCachedProjectId: () => "proj-1",
      setCachedProjectId: vi.fn(),
    })

    const sources = harness.registrations.find((tool) => tool.name === "sources")
    expect(sources?.description).toContain("Project-governed source")
    expect(sources?.description).toContain("index")
    expect(sources?.description).toContain("search")
    expect(sources?.description).toContain("promote")
  })

  it("emits MCP tool lifecycle events once for a read tool", async () => {
    const harness = createServerHarness()
    const captureAnalytics = vi.fn()
    const client = {
      get: vi.fn().mockResolvedValue({ projects: [] }),
      captureAnalytics,
      getAgentName: vi.fn().mockReturnValue("codex"),
      getClientName: vi.fn().mockReturnValue("relay-mcp:codex"),
    }

    registerTools(harness.server as never, {
      client: client as never,
      resolveProjectId: vi.fn(async (projectId?: string) => projectId ?? "proj-1"),
      resolveProjectSelection: undefined,
      getCachedProjectId: () => "proj-1",
      setCachedProjectId: vi.fn(),
    })

    const listProjects = harness.registrations.find((tool) => tool.name === "list_projects")
    expect(listProjects).toBeDefined()

    await listProjects!.handler({})

    expect(captureAnalytics).toHaveBeenNthCalledWith(1, "mcp_tool_called", expect.objectContaining({
      tool_name: "list_projects",
      transport: "stdio",
      read_or_write: "read",
      project_id: "proj-1",
      success: true,
    }))
    expect(captureAnalytics).toHaveBeenNthCalledWith(2, "mcp_tool_completed", expect.objectContaining({
      tool_name: "list_projects",
      transport: "stdio",
      read_or_write: "read",
      project_id: "proj-1",
      success: true,
    }))
  })

  it("emits MCP tool failure analytics once for an erroring tool", async () => {
    const harness = createServerHarness()
    const captureAnalytics = vi.fn()
    const client = {
      post: vi.fn().mockRejectedValue(new Error("boom")),
      captureAnalytics,
      getAgentName: vi.fn().mockReturnValue("codex"),
      getClientName: vi.fn().mockReturnValue("relay-mcp:codex"),
    }

    registerTools(harness.server as never, {
      client: client as never,
      resolveProjectId: vi.fn(async (projectId?: string) => projectId ?? "proj-1"),
      resolveProjectSelection: undefined,
      getCachedProjectId: () => "proj-1",
      setCachedProjectId: vi.fn(),
    })

    const save = harness.registrations.find((tool) => tool.name === "save")
    expect(save).toBeDefined()

    await expect(save!.handler({
      action: "add_memory",
      payload: { type: "note", content: "test" },
    })).rejects.toThrow("boom")

    expect(captureAnalytics).toHaveBeenNthCalledWith(1, "mcp_tool_called", expect.objectContaining({
      tool_name: "save",
      transport: "stdio",
      read_or_write: "write",
      project_id: "proj-1",
      success: true,
    }))
    expect(captureAnalytics).toHaveBeenNthCalledWith(2, "mcp_tool_failed", expect.objectContaining({
      tool_name: "save",
      transport: "stdio",
      read_or_write: "write",
      project_id: "proj-1",
      success: false,
    }))
  })
})
