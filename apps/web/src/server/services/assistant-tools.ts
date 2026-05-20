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
  },
  {
    name: "recall_past_chats",
    description:
      "Search the user's previous Ask Relay conversations and return matching chat titles with recent snippets. Use when the user refers to something discussed before ('what did we decide earlier', 'continue that').",
    parameters: obj({ query: str("What to look for in past chats") }, ["query"])
  },
  {
    name: "list_sources",
    description: "List a project's indexed sources (docs, repos, URLs).",
    parameters: obj({ projectId: str("Relay project id") }, ["projectId"])
  },
  {
    name: "search_sources",
    description:
      "Semantic + lexical search across a project's indexed source content. Use to ground answers in the user's own documents.",
    parameters: obj(
      { projectId: str("Relay project id"), query: str("Search query") },
      ["projectId", "query"]
    )
  },
  {
    name: "read_source",
    description: "Read a specific source's detail/chunks by source id.",
    parameters: obj(
      {
        projectId: str("Relay project id"),
        sourceId: str("Source id"),
        chunkId: str("Optional chunk id"),
        limit: { type: "number", description: "Max chunks" }
      },
      ["projectId", "sourceId"]
    )
  },
  {
    name: "explore_sources",
    description: "Browse a project's source tree / outline to find what to read next.",
    parameters: obj(
      { projectId: str("Relay project id"), query: str("Optional focus") },
      ["projectId"]
    )
  },
  {
    name: "grep_sources",
    description: "Regex/literal search inside a project's source files.",
    parameters: obj(
      { projectId: str("Relay project id"), pattern: str("Pattern to find") },
      ["projectId", "pattern"]
    )
  },
  {
    name: "import_source_citation",
    description:
      "Promote a source passage into project memory as a cited fact. Use when the user asks to save something from a source.",
    parameters: obj(
      {
        projectId: str("Relay project id"),
        sourceId: str("Source id"),
        chunkId: str("Chunk/citation id"),
        note: str("Optional note")
      },
      ["projectId", "sourceId"]
    )
  },
  {
    name: "refresh_source",
    description: "Re-index a source to pull its latest content.",
    parameters: obj(
      { projectId: str("Relay project id"), sourceId: str("Source id") },
      ["projectId", "sourceId"]
    )
  },
  {
    name: "get_project_state",
    description:
      "Get the structured project state: objective, constraints, decisions, open tasks, stack.",
    parameters: obj({ projectId: str("Relay project id") }, ["projectId"])
  },
  {
    name: "set_project_state",
    description:
      "Update structured project state (objective/constraints/tasks/etc). Destructive — only when the user clearly asked to change project state.",
    parameters: obj(
      {
        projectId: str("Relay project id"),
        currentObjective: str("New objective (optional)"),
        recentProgress: str("Progress note (optional)"),
        decisions: { type: "array", items: { type: "string" }, description: "Decisions" },
        constraints: { type: "array", items: { type: "string" }, description: "Constraints" },
        openTasks: { type: "array", items: { type: "string" }, description: "Open tasks" }
      },
      ["projectId"]
    )
  },
  {
    name: "trace_context",
    description: "Trace where a fact/state field came from across captures and sources.",
    parameters: obj(
      {
        projectId: str("Relay project id"),
        query: str("What to trace"),
        stateField: str("Optional state field"),
        limit: { type: "number", description: "Max items" }
      },
      ["projectId"]
    )
  },
  {
    name: "save_context",
    description:
      "Save a session checkpoint: summary, progress, decisions, next steps. Use when the user wants to record where things stand.",
    parameters: obj(
      {
        projectId: str("Relay project id"),
        summary: str("What was done"),
        progress: str("Current progress"),
        decisions: { type: "array", items: { type: "string" }, description: "Decisions" },
        nextSteps: { type: "array", items: { type: "string" }, description: "Next steps" }
      },
      ["projectId"]
    )
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

// Stopwords that drag every doc to the same score; dropping them lets a
// query like "how do I use the extension" actually rank /docs/extension.
const KNOWLEDGE_STOPWORDS = new Set([
  "and", "the", "are", "for", "you", "your", "with", "what", "how", "use",
  "using", "can", "have", "this", "that", "does", "any", "from", "about",
  "into", "out", "off", "all", "one", "two", "but", "not", "set", "get",
  "relay", "ask"
])

function searchRelayKnowledge(query: string): string {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !KNOWLEDGE_STOPWORDS.has(t))
  const scored = Object.entries(PUBLIC_MARKDOWN_PAGES).map(([path, content]) => {
    const haystack = content.toLowerCase()
    const pathHay = path.toLowerCase()
    // Each match counts once; a hit in the path is worth 3 to bias toward
    // the canonical doc for a topic (e.g. "extension" → /docs/extension).
    const score = terms.reduce((acc, t) => {
      let s = 0
      if (haystack.includes(t)) s += 1
      if (pathHay.includes(t)) s += 3
      return acc + s
    }, 0)
    return { path, content, score }
  })
  scored.sort((a, b) => b.score - a.score)

  const fallback = PUBLIC_MARKDOWN_PAGES["/docs/getting-started"] ?? PUBLIC_MARKDOWN_PAGES["/docs"] ?? ""
  if (!scored[0] || scored[0].score === 0) {
    return `Source: /docs/getting-started\n\n${fallback.slice(0, 6000)}`
  }

  // Concatenate the top two so a "how to use" question gets both the
  // overview and the matching deep doc (each capped tightly to keep prompt
  // budget sane).
  const picks = scored.filter((s) => s.score > 0).slice(0, 2)
  return picks
    .map((p) => `Source: ${p.path}\n\n${p.content.slice(0, 4000)}`)
    .join("\n\n---\n\n")
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
  options: { plan: AssistantPlan; chatId?: string }
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
        tags: Array.isArray(args.tags) ? (args.tags as string[]) : undefined,
        // Attribute in-app assistant ("Ask Relay") captures so the memory
        // list can show provenance.
        sourceSurface: "ask_relay"
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
        action: action === "delete" ? "deleted" : "updated",
        entity: "memory item",
        count: ids.length,
        items: ids.map((id) => ({ id, label: id })),
        // delete is a hard remove with no exposed inverse; be honest about it.
        irreversible: action === "delete"
      }
      return { modelResponse: { result: `Memory ${action} applied to ${ids.length} item(s).` }, actionResult }
    }
    case "relay_knowledge": {
      return { modelResponse: { result: searchRelayKnowledge(String(args.query)) }, actionResult: null }
    }
    case "recall_past_chats": {
      const res = await client.recallPastChats(String(args.query ?? ""), {
        limit: 6,
        excludeChatId: options.chatId
      })
      return { modelResponse: summarizeForModel(res, 6000), actionResult: null }
    }
    case "list_sources": {
      const res = await client.listSources(String(args.projectId))
      return { modelResponse: summarizeForModel(res), actionResult: null }
    }
    case "search_sources": {
      const res = await client.searchSources(String(args.projectId), args)
      return { modelResponse: summarizeForModel(res), actionResult: null }
    }
    case "read_source": {
      const res = await client.getSourceDetail(String(args.projectId), String(args.sourceId), {
        chunkId: args.chunkId,
        limit: args.limit
      })
      return { modelResponse: summarizeForModel(res), actionResult: null }
    }
    case "explore_sources": {
      const res = await client.exploreSources(String(args.projectId), args)
      return { modelResponse: summarizeForModel(res), actionResult: null }
    }
    case "grep_sources": {
      const res = await client.grepSources(String(args.projectId), args)
      return { modelResponse: summarizeForModel(res), actionResult: null }
    }
    case "import_source_citation": {
      const res = await client.importSourceCitations(String(args.projectId), args)
      const actionResult: AssistantActionResult = {
        tool: "import_source_citation",
        action: "created",
        entity: "cited fact",
        count: 1,
        items: [{ label: String(args.note ?? "Imported from source") }]
      }
      return { modelResponse: summarizeForModel(res), actionResult }
    }
    case "refresh_source": {
      await client.refreshSource(String(args.projectId), String(args.sourceId))
      const actionResult: AssistantActionResult = {
        tool: "refresh_source",
        action: "updated",
        entity: "source",
        count: 1,
        items: [{ id: String(args.sourceId), label: "Re-indexed" }]
      }
      return { modelResponse: { result: "Source refresh started." }, actionResult }
    }
    case "get_project_state": {
      const res = await client.getProjectState(String(args.projectId))
      return { modelResponse: summarizeForModel(res), actionResult: null }
    }
    case "set_project_state": {
      await client.setProjectState(String(args.projectId), args)
      const actionResult: AssistantActionResult = {
        tool: "set_project_state",
        action: "updated",
        entity: "project state",
        count: 1,
        items: []
      }
      return { modelResponse: { result: "Project state updated." }, actionResult }
    }
    case "trace_context": {
      const res = await client.traceContext(String(args.projectId), {
        query: typeof args.query === "string" ? args.query : undefined,
        stateField: typeof args.stateField === "string" ? args.stateField : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined
      })
      return { modelResponse: summarizeForModel(res), actionResult: null }
    }
    case "save_context": {
      const res = await client.saveContext(String(args.projectId), args)
      const actionResult: AssistantActionResult = {
        tool: "save_context",
        action: "created",
        entity: "checkpoint",
        count: 1,
        items: [{ label: String(args.summary ?? "Session checkpoint") }]
      }
      return { modelResponse: summarizeForModel(res), actionResult }
    }
    default:
      return { modelResponse: { error: `Unknown tool: ${name}` }, actionResult: null }
  }
}
