import { describe, expect, it } from "vitest"

import type { RelayHttpMcpClient } from "@/app/api/mcp/stream/relay-http-mcp-client"

import { ASSISTANT_TOOL_DECLARATIONS, DESTRUCTIVE_TOOLS, executeAssistantTool } from "./assistant-tools"

const stubClient = {} as unknown as RelayHttpMcpClient

describe("assistant tool registry", () => {
  it("declares well-formed tools including list_projects and add_memory", () => {
    const names = ASSISTANT_TOOL_DECLARATIONS.map((t) => t.name)
    expect(names).toContain("list_projects")
    expect(names).toContain("add_memory")
    expect(names).toContain("relay_knowledge")
    for (const tool of ASSISTANT_TOOL_DECLARATIONS) {
      expect(tool.name).toMatch(/^[a-z_]+$/)
      expect(tool.description.length).toBeGreaterThan(10)
      expect(tool.parameters).toHaveProperty("type", "object")
    }
  })

  it("classifies destructive tools for confirmation", () => {
    expect(DESTRUCTIVE_TOOLS.has("manage_memory")).toBe(true)
    expect(DESTRUCTIVE_TOOLS.has("set_project_state")).toBe(true)
    expect(DESTRUCTIVE_TOOLS.has("add_memory")).toBe(false)
  })

  it("blocks destructive tools on the Free plan without touching the client", async () => {
    const result = await executeAssistantTool(
      stubClient,
      "manage_memory",
      { action: "delete", memoryId: ["m1"] },
      { plan: "free" }
    )
    expect(result.actionResult).toBeNull()
    expect(String(result.modelResponse.error)).toMatch(/Free plan/i)
  })

  it("also gates set_project_state on the Free plan", async () => {
    const result = await executeAssistantTool(
      stubClient,
      "set_project_state",
      { projectId: "p1", currentObjective: "x" },
      { plan: "free" }
    )
    expect(result.actionResult).toBeNull()
    expect(String(result.modelResponse.error)).toMatch(/Free plan/i)
  })

  it("flags hard delete as irreversible and archive as reversible", async () => {
    const client = { manageMemory: async () => {} } as unknown as RelayHttpMcpClient
    const del = await executeAssistantTool(
      client,
      "manage_memory",
      { action: "delete", memoryId: ["m1", "m2"] },
      { plan: "pro" }
    )
    expect(del.actionResult?.action).toBe("deleted")
    expect(del.actionResult?.irreversible).toBe(true)
    expect(del.actionResult?.undoRef).toBeUndefined()

    const arch = await executeAssistantTool(
      client,
      "manage_memory",
      { action: "archive", memoryId: ["m1"] },
      { plan: "pro" }
    )
    expect(arch.actionResult?.irreversible).toBeFalsy()
  })

  it("passes atomic cross-project transfer details through manage_memory", async () => {
    const calls: Record<string, unknown>[] = []
    const client = {
      manageMemory: async (args: Record<string, unknown>) => calls.push(args),
      getMemory: async () => null,
    } as unknown as RelayHttpMcpClient

    const result = await executeAssistantTool(
      client,
      "manage_memory",
      {
        action: "transfer",
        memoryId: ["m1"],
        targetProjectId: "personal",
        type: "note",
        personalCategory: "person",
      },
      { plan: "pro" },
    )

    expect(calls).toEqual([
      expect.objectContaining({
        action: "transfer",
        targetProjectId: "personal",
        type: "note",
        personalCategory: "person",
      }),
    ])
    expect(result.actionResult?.previews?.[0]?.before?.id).toBe("m1")
  })

  it("answers Relay product questions from public docs", async () => {
    const result = await executeAssistantTool(stubClient, "relay_knowledge", { query: "what is mcp" }, {
      plan: "free"
    })
    expect(typeof result.modelResponse.result).toBe("string")
    expect(String(result.modelResponse.result).length).toBeGreaterThan(20)
  })
})
