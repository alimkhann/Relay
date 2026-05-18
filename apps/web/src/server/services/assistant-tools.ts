import type { AssistantActionResult } from "@relay/shared"

import type { RelayHttpMcpClient } from "@/app/api/mcp/stream/relay-http-mcp-client"
import { PUBLIC_MARKDOWN_PAGES } from "@/server/discovery/markdown-content"
import type { GeminiFunctionDeclaration } from "@/server/services/gemini-service"

export type AssistantPlan = "free" | "starter" | "pro"

/** Tools whose effects are not safely reversible — require explicit confirmation. */
export const DESTRUCTIVE_TOOLS = new Set(["manage_memory", "set_project_state"])

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required
})

const str = (description: string) => ({ type: "string", description })

export const ASSISTANT_TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: "list_projects",
    description:
      "List the user's Relay projects with id, name, memory count and recent activity. Call this first to get a projectId for other tools.",
    parameters: obj({})
  },
  {
    name: "recall_context",
    description:
      "Get a concise continuity briefing for a project: current objective, progress, and memory items matching a query. Best first call when the user asks 'what was I doing'.",
    parameters: obj(
      { projectId: str("Relay project id"), query: str("What to recall about") },
      ["projectId", "query"]
    )
  },
  {
    name: "search_memory",
    description: "Search a project's saved memory items (decisions, constraints, tasks, notes).",
    parameters: obj(
      {
        projectId: str("Relay project id"),
        query: str("Search query"),
        limit: { type: "number", description: "Max results (default 8)" }
      },
      ["projectId", "query"]
    )
  },
  {
    name: "list_recent_activity",
    description: "List recent continuity activity (captures, updates) for a project.",
    parameters: obj(
      { projectId: str("Relay project id"), limit: { type: "number", description: "Max items (default 10)" } },
      ["projectId"]
    )
  },
  {
    name: "get_brief",
    description: "Generate or fetch the project's context brief (a resume-ready summary).",
    parameters: obj({ projectId: str("Relay project id") }, ["projectId"])
  },
  {
    name: "add_memory",
    description:
      "Save a new memory item to a project. Use when the user asks to remember a decision, constraint, task, or note.",
    parameters: obj(
      {
        projectId: str("Relay project id"),
        type: {
          type: "string",
          enum: ["decision", "constraint", "task", "note", "requirement", "artifact"],
          description: "Memory item type"
        },
        content: str("The memory content"),
        title: str("Optional short title"),
        tags: { type: "array", items: { type: "string" }, description: "Optional tags" }
      },
      ["projectId", "type", "content"]
    )
  },
  {
    name: "manage_memory",
    description:
      "Delete, archive, or update existing memory items. Destructive — only call when the user clearly asked to remove or change saved memory.",
    parameters: obj(
      {
        action: { type: "string", enum: ["delete", "archive", "update"], description: "What to do" },
        memoryId: { type: "array", items: { type: "string" }, description: "Memory item id(s)" },
        content: str("New content (update only)"),
        title: str("New title (update only)"),
        tags: { type: "array", items: { type: "string" }, description: "New tags (update only)" }
      },
      ["action", "memoryId"]
    )
  },
  {
    name: "relay_knowledge",
    description:
      "Look up how Relay itself works (features, plans, MCP, extension, getting started). Use for product questions, not user data.",
    parameters: obj({ query: str("What the user wants to know about Relay") }, ["query"])
  }
]

function summarizeForModel(value: unknown, max = 4000): Record<string, unknown> {
  let text: string
  try {
    text = typeof value === "string" ? value : JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (text.length > max) text = `${text.slice(0, max)}…(truncated)`
  return { result: text }
}

function searchRelayKnowledge(query: string): string {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
  let best: { path: string; content: string; score: number } | null = null
  for (const [path, content] of Object.entries(PUBLIC_MARKDOWN_PAGES)) {
    const haystack = content.toLowerCase()
    const score = terms.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0)
    if (!best || score > best.score) best = { path, content, score }
  }
  if (!best || best.score === 0) {
    return PUBLIC_MARKDOWN_PAGES["/docs"] ?? "No Relay documentation matched."
  }
  return `Source: ${best.path}\n\n${best.content.slice(0, 6000)}`
}

export interface ToolExecutionResult {
  modelResponse: Record<string, unknown>
  actionResult: AssistantActionResult | null
}

/**
 * Execute a tool against the viewer-scoped MCP client. Free plan cannot run
 * destructive tools (kept safe and cheap for the taste tier).
 */
export async function executeAssistantTool(
  client: RelayHttpMcpClient,
  name: string,
  args: Record<string, unknown>,
  options: { plan: AssistantPlan }
): Promise<ToolExecutionResult> {
  if (DESTRUCTIVE_TOOLS.has(name) && options.plan === "free") {
    return {
      modelResponse: {
        error: "This action changes saved data and is not available on the Free plan. Suggest upgrading."
      },
      actionResult: null
    }
  }

  switch (name) {
    case "list_projects": {
      const projects = await client.listProjects()
      return { modelResponse: summarizeForModel(projects), actionResult: null }
    }
    case "recall_context": {
      const text = await client.recallContext(String(args.projectId), String(args.query))
      return { modelResponse: { result: text }, actionResult: null }
    }
    case "search_memory": {
      const results = await client.searchMemory(String(args.projectId), String(args.query), {
        limit: typeof args.limit === "number" ? args.limit : 8
      })
      return { modelResponse: summarizeForModel(results), actionResult: null }
    }
    case "list_recent_activity": {
      const activity = await client.listRecentActivity(String(args.projectId), {
        limit: typeof args.limit === "number" ? args.limit : 10
      })
      return { modelResponse: summarizeForModel(activity), actionResult: null }
    }
    case "get_brief": {
      const brief = await client.getBrief(String(args.projectId), {})
      return { modelResponse: summarizeForModel(brief), actionResult: null }
    }
    case "add_memory": {
      const created = (await client.addMemory(String(args.projectId), {
        type: String(args.type),
        content: String(args.content),
        title: args.title ? String(args.title) : undefined,
        tags: Array.isArray(args.tags) ? (args.tags as string[]) : undefined
      })) as { id?: string; title?: string | null; content?: string }
      const label = created.title || (created.content ?? String(args.content)).slice(0, 80)
      const actionResult: AssistantActionResult = {
        tool: "add_memory",
        action: "created",
        entity: "memory item",
        count: 1,
        items: [{ id: created.id, label }],
        undoRef: created.id
          ? { tool: "manage_memory", args: { action: "delete", memoryId: [created.id] } }
          : undefined
      }
      return { modelResponse: { result: "Memory item saved.", id: created.id }, actionResult }
    }
    case "manage_memory": {
      const action = String(args.action)
      const ids = Array.isArray(args.memoryId)
        ? (args.memoryId as string[])
        : [String(args.memoryId)]
      await client.manageMemory(args)
      const actionResult: AssistantActionResult = {
        tool: "manage_memory",
        action: action === "delete" ? "deleted" : action === "archive" ? "updated" : "updated",
        entity: "memory item",
        count: ids.length,
        items: ids.map((id) => ({ id, label: id }))
      }
      return { modelResponse: { result: `Memory ${action} applied to ${ids.length} item(s).` }, actionResult }
    }
    case "relay_knowledge": {
      return { modelResponse: { result: searchRelayKnowledge(String(args.query)) }, actionResult: null }
    }
    default:
      return { modelResponse: { error: `Unknown tool: ${name}` }, actionResult: null }
  }
}
