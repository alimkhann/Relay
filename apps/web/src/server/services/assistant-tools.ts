import type { AssistantActionResult } from "@relay/shared"

import type { RelayHttpMcpClient } from "@/app/api/mcp/stream/relay-http-mcp-client"
import { PUBLIC_MARKDOWN_PAGES } from "@/server/discovery/markdown-content"
import type { GeminiFunctionDeclaration } from "@/server/services/gemini-service"

export type AssistantPlan = "free" | "starter" | "pro"

/** Tools whose effects are not safely reversible — require explicit confirmation.
 * Outward-facing writes (calendar mutations, sending email) always confirm. */
export const DESTRUCTIVE_TOOLS = new Set([
  "manage_memory",
  "set_project_state",
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
  "send_gmail"
])

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
      "List the user's Relay projects with id, name, kind, memory count and recent activity. Use only for explicit cross-project discovery or when the requested project is ambiguous.",
    parameters: obj({})
  },
  {
    name: "recall_context",
    description:
      "Get a concise continuity briefing for a project: current objective, progress, and memory items matching a query. Best first call when the user asks 'what was I doing'.",
    parameters: obj(
      { projectId: str("Relay project id"), query: str("What to recall about") },
      ["query"]
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
      ["query"]
    )
  },
  {
    name: "list_recent_activity",
    description: "List recent continuity activity (captures, updates) for a project.",
    parameters: obj(
      { projectId: str("Relay project id"), limit: { type: "number", description: "Max items (default 10)" } },
      []
    )
  },
  {
    name: "get_brief",
    description: "Generate or fetch the project's context brief (a resume-ready summary).",
    parameters: obj({ projectId: str("Relay project id; omit to use the selected project") })
  },
  {
    name: "add_memory",
    description:
      "Save a new memory item. Use whenever a durable fact, decision, constraint, task, or artifact is worth remembering. For the Personal project, ALSO set personalCategory so it lands in the right column.",
    parameters: obj(
      {
        projectId: str("Relay project id"),
        type: {
          type: "string",
          enum: ["decision", "constraint", "task", "note", "requirement", "artifact"],
          description: "Memory item type (used by regular projects)"
        },
        personalCategory: {
          type: "string",
          enum: ["person", "company", "concept", "event", "meeting", "signals", "note"],
          description:
            "Personal-memory Folk category. Set this when saving to the Personal project — pick the best fit (a person → person, an idea/trait/goal → concept, a dated milestone → event, etc.). Omit for regular projects."
        },
        content: str("The memory content"),
        title: str("Optional short title"),
        tags: { type: "array", items: { type: "string" }, description: "Optional tags" }
      },
      ["type", "content"]
    )
  },
  {
    name: "manage_memory",
    description:
      "Delete, archive, or update existing memory items. Destructive — only call when the user clearly asked to remove or change saved memory.",
    parameters: obj(
      {
        action: { type: "string", enum: ["delete", "archive", "update", "transfer"], description: "What to do" },
        memoryId: { type: "array", items: { type: "string" }, description: "Memory item id(s)" },
        content: str("New content (update only)"),
        title: str("New title (update only)"),
        tags: { type: "array", items: { type: "string" }, description: "New tags (update only)" },
        targetProjectId: str("Destination project id (transfer only)"),
        type: str("Destination memory type (transfer/type-change only)"),
        personalCategory: str("Personal Folk category to set (update or transfer); recategorizes a personal item into the right column")
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

/** Live web search — the model invokes this whenever it needs current or
 * external facts. Executed as a dedicated grounding pass (never combined with
 * function declarations in one request — Gemini drops one of them). */
export const WEB_SEARCH_TOOL_DECLARATION: GeminiFunctionDeclaration = {
  name: "web_search",
  description:
    "Search the live web for current or external information (news, prices, releases, docs, anything outside the user's Relay data). Returns a grounded answer with source URLs. Use whenever fresh facts are needed — do not guess about recent events.",
  parameters: obj({ query: str("What to search the web for") }, ["query"])
}

/** Google tools — only offered when the user has connected Google. */
export const GOOGLE_TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: "list_calendar_events",
    description:
      "List upcoming events from the user's Google Calendar. Use for 'what's on my calendar', meeting prep, or availability questions.",
    parameters: obj({
      timeMin: str("ISO datetime lower bound (default: now)"),
      timeMax: str("ISO datetime upper bound"),
      query: str("Optional free-text filter"),
      maxResults: { type: "number", description: "Max events (default 10)" }
    })
  },
  {
    name: "create_calendar_event",
    description:
      "Create an event on the user's Google Calendar. Requires user confirmation before it runs.",
    parameters: obj(
      {
        summary: str("Event title"),
        description: str("Optional details"),
        location: str("Optional location"),
        startIso: str("Start as ISO datetime, e.g. 2026-06-13T15:00:00+05:00"),
        endIso: str("End as ISO datetime"),
        timeZone: str("Optional IANA time zone, e.g. Asia/Almaty"),
        attendees: { type: "array", items: { type: "string" }, description: "Attendee emails" }
      },
      ["summary", "startIso", "endIso"]
    )
  },
  {
    name: "update_calendar_event",
    description: "Update an existing Google Calendar event (find its id via list_calendar_events first). Requires user confirmation.",
    parameters: obj(
      {
        eventId: str("Calendar event id"),
        summary: str("New title"),
        description: str("New details"),
        location: str("New location"),
        startIso: str("New start ISO datetime"),
        endIso: str("New end ISO datetime"),
        timeZone: str("Optional IANA time zone")
      },
      ["eventId"]
    )
  },
  {
    name: "delete_calendar_event",
    description: "Delete a Google Calendar event (find its id via list_calendar_events first). Requires user confirmation.",
    parameters: obj({ eventId: str("Calendar event id") }, ["eventId"])
  },
  {
    name: "search_gmail",
    description:
      "Search the user's Gmail. Supports Gmail query syntax (from:, subject:, newer_than:7d, is:unread...). Returns sender, subject, date, snippet, threadId.",
    parameters: obj(
      {
        query: str("Gmail search query"),
        maxResults: { type: "number", description: "Max messages (default 8)" }
      },
      ["query"]
    )
  },
  {
    name: "read_gmail_thread",
    description: "Read a full Gmail thread (find threadId via search_gmail first).",
    parameters: obj({ threadId: str("Gmail thread id") }, ["threadId"])
  },
  {
    name: "draft_gmail",
    description:
      "Create a DRAFT email in the user's Gmail (not sent). Safe default for composing — the user reviews it in Gmail or asks you to send it.",
    parameters: obj(
      {
        to: str("Recipient email"),
        subject: str("Subject line"),
        body: str("Plain-text body"),
        threadId: str("Optional thread id when replying")
      },
      ["to", "subject", "body"]
    )
  },
  {
    name: "send_gmail",
    description:
      "SEND an email from the user's Gmail. Requires user confirmation before it runs. Only call when the user explicitly asked to send.",
    parameters: obj(
      {
        to: str("Recipient email"),
        subject: str("Subject line"),
        body: str("Plain-text body"),
        threadId: str("Optional thread id when replying")
      },
      ["to", "subject", "body"]
    )
  }
]

/** Assemble the per-turn tool set: base Relay tools + web search + any
 * connected-provider tools. Single source of truth for every surface. */
export function buildAssistantToolDeclarations(input: {
  providers: ReadonlySet<string>
}): GeminiFunctionDeclaration[] {
  return [
    ...ASSISTANT_TOOL_DECLARATIONS,
    WEB_SEARCH_TOOL_DECLARATION,
    ...(input.providers.has("google") ? GOOGLE_TOOL_DECLARATIONS : [])
  ]
}

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

function actionItem(value: unknown, fallback: string) {
  const item = (value ?? {}) as Record<string, unknown>
  const content = typeof item.content === "string" ? item.content : undefined
  const title = typeof item.title === "string" ? item.title : null
  const metadata = (item.metadata ?? {}) as Record<string, unknown>
  return {
    id: typeof item.id === "string" ? item.id : fallback,
    label: title || content?.slice(0, 120) || fallback,
    title,
    content,
    type: typeof item.type === "string" ? item.type : undefined,
    projectId: typeof item.projectId === "string" ? item.projectId : undefined,
    personalCategory:
      typeof metadata.personalCategory === "string" ? metadata.personalCategory : undefined,
  }
}

async function getMemorySnapshot(client: RelayHttpMcpClient, id: string) {
  if (typeof client.getMemory !== "function") return null
  return client.getMemory(id).catch(() => null)
}

export async function previewAssistantTool(
  client: RelayHttpMcpClient,
  name: string,
  args: Record<string, unknown>,
) {
  if (name !== "manage_memory") return []
  const ids = Array.isArray(args.memoryId) ? (args.memoryId as string[]) : [String(args.memoryId)]
  const before = await Promise.all(ids.slice(0, 5).map((id) => getMemorySnapshot(client, id)))
  return ids.slice(0, 5).map((id, index) => {
    const prior = actionItem(before[index], id)
    if (args.action === "delete" || args.action === "archive") return { before: prior }
    return {
      before: prior,
      after: {
        ...prior,
        content: typeof args.content === "string" ? args.content : prior.content,
        label:
          typeof args.title === "string"
            ? args.title
            : typeof args.content === "string"
              ? args.content.slice(0, 120)
              : prior.label,
        title: typeof args.title === "string" ? args.title : prior.title,
        type: typeof args.type === "string" ? args.type : prior.type,
        projectId:
          typeof args.targetProjectId === "string" ? args.targetProjectId : prior.projectId,
        personalCategory:
          typeof args.personalCategory === "string" ? args.personalCategory : prior.personalCategory,
      },
    }
  })
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

const GOOGLE_TOOL_NAMES = new Set(GOOGLE_TOOL_DECLARATIONS.map((tool) => tool.name))

function formatEventLabel(event: { summary: string; start: string }) {
  const when = event.start ? new Date(event.start).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""
  return when ? `${event.summary} — ${when}` : event.summary
}

/** Google Calendar / Gmail tools. Returns null for non-google tool names. */
async function executeGoogleTool(
  name: string,
  args: Record<string, unknown>,
  options: { userId?: string }
): Promise<ToolExecutionResult | null> {
  if (!GOOGLE_TOOL_NAMES.has(name)) return null
  const userId = options.userId
  if (!userId) {
    return { modelResponse: { error: "Google tools need a signed-in user context." }, actionResult: null }
  }
  const google = await import("@/server/services/integrations/google-service")

  switch (name) {
    case "list_calendar_events": {
      const events = await google.listCalendarEvents(userId, {
        timeMin: typeof args.timeMin === "string" ? args.timeMin : undefined,
        timeMax: typeof args.timeMax === "string" ? args.timeMax : undefined,
        query: typeof args.query === "string" ? args.query : undefined,
        maxResults: typeof args.maxResults === "number" ? args.maxResults : undefined
      })
      return { modelResponse: summarizeForModel(events, 6000), actionResult: null }
    }
    case "create_calendar_event": {
      const event = await google.createCalendarEvent(userId, {
        summary: String(args.summary),
        description: typeof args.description === "string" ? args.description : undefined,
        location: typeof args.location === "string" ? args.location : undefined,
        startIso: String(args.startIso),
        endIso: String(args.endIso),
        timeZone: typeof args.timeZone === "string" ? args.timeZone : undefined,
        attendees: Array.isArray(args.attendees) ? (args.attendees as string[]) : undefined
      })
      const actionResult: AssistantActionResult = {
        tool: "create_calendar_event",
        action: "created",
        entity: "calendar event",
        count: 1,
        items: [{ id: event.htmlLink ?? event.id, label: formatEventLabel(event) }]
      }
      return {
        modelResponse: { result: `Event created: ${formatEventLabel(event)}`, link: event.htmlLink },
        actionResult
      }
    }
    case "update_calendar_event": {
      const event = await google.updateCalendarEvent(userId, {
        eventId: String(args.eventId),
        summary: typeof args.summary === "string" ? args.summary : undefined,
        description: typeof args.description === "string" ? args.description : undefined,
        location: typeof args.location === "string" ? args.location : undefined,
        startIso: typeof args.startIso === "string" ? args.startIso : undefined,
        endIso: typeof args.endIso === "string" ? args.endIso : undefined,
        timeZone: typeof args.timeZone === "string" ? args.timeZone : undefined
      })
      const actionResult: AssistantActionResult = {
        tool: "update_calendar_event",
        action: "updated",
        entity: "calendar event",
        count: 1,
        items: [{ id: event.htmlLink ?? event.id, label: formatEventLabel(event) }]
      }
      return { modelResponse: { result: `Event updated: ${formatEventLabel(event)}` }, actionResult }
    }
    case "delete_calendar_event": {
      await google.deleteCalendarEvent(userId, String(args.eventId))
      const actionResult: AssistantActionResult = {
        tool: "delete_calendar_event",
        action: "deleted",
        entity: "calendar event",
        count: 1,
        items: [{ id: String(args.eventId), label: "Calendar event" }],
        irreversible: true
      }
      return { modelResponse: { result: "Event deleted." }, actionResult }
    }
    case "search_gmail": {
      const messages = await google.searchGmail(userId, {
        query: String(args.query),
        maxResults: typeof args.maxResults === "number" ? args.maxResults : undefined
      })
      return { modelResponse: summarizeForModel(messages, 6000), actionResult: null }
    }
    case "read_gmail_thread": {
      const thread = await google.readGmailThread(userId, String(args.threadId))
      return { modelResponse: summarizeForModel(thread, 8000), actionResult: null }
    }
    case "draft_gmail": {
      const draft = await google.createGmailDraft(userId, {
        to: String(args.to),
        subject: String(args.subject),
        body: String(args.body),
        threadId: typeof args.threadId === "string" ? args.threadId : undefined
      })
      const actionResult: AssistantActionResult = {
        tool: "draft_gmail",
        action: "created",
        entity: "email draft",
        count: 1,
        items: [{ id: draft.draftId, label: `Draft to ${String(args.to)}: ${String(args.subject)}` }]
      }
      return {
        modelResponse: { result: `Draft created in Gmail (to ${String(args.to)}).` },
        actionResult
      }
    }
    case "send_gmail": {
      const sent = await google.sendGmail(userId, {
        to: String(args.to),
        subject: String(args.subject),
        body: String(args.body),
        threadId: typeof args.threadId === "string" ? args.threadId : undefined
      })
      const actionResult: AssistantActionResult = {
        tool: "send_gmail",
        action: "created",
        entity: "sent email",
        count: 1,
        items: [{ id: sent.messageId, label: `To ${String(args.to)}: ${String(args.subject)}` }],
        irreversible: true
      }
      return { modelResponse: { result: `Email sent to ${String(args.to)}.` }, actionResult }
    }
    default:
      return null
  }
}

/**
 * Execute a tool against the viewer-scoped MCP client. Free plan cannot run
 * destructive tools (kept safe and cheap for the taste tier).
 */
export async function executeAssistantTool(
  client: RelayHttpMcpClient,
  name: string,
  args: Record<string, unknown>,
  options: {
    plan: AssistantPlan
    chatId?: string
    userId?: string
    /** Grounded web answer runner — injected by the agent service so the
     * grounding pass stays a dedicated Gemini call. */
    runWebSearch?: (query: string) => Promise<{
      text: string
      citations: Array<{ uri: string; title?: string }>
    }>
  }
): Promise<ToolExecutionResult> {
  if (DESTRUCTIVE_TOOLS.has(name) && options.plan === "free") {
    return {
      modelResponse: {
        error: "This action changes saved data and is not available on the Free plan. Suggest upgrading."
      },
      actionResult: null
    }
  }

  if (name === "web_search") {
    if (options.plan === "free") {
      return {
        modelResponse: {
          error: "Web search is available on paid Relay plans. Answer from what you know and mention the upgrade."
        },
        actionResult: null
      }
    }
    if (!options.runWebSearch) {
      return { modelResponse: { error: "Web search is unavailable right now." }, actionResult: null }
    }
    const grounded = await options.runWebSearch(String(args.query ?? ""))
    const actionResult: AssistantActionResult = {
      tool: "web_search",
      action: "read",
      entity: "web",
      count: grounded.citations.length,
      items: grounded.citations.slice(0, 8).map((c) => ({ id: c.uri, label: c.title ?? c.uri }))
    }
    return {
      modelResponse: {
        result: grounded.text,
        sources: grounded.citations.slice(0, 5).map((c) => c.uri).join(" ")
      },
      actionResult: grounded.citations.length > 0 ? actionResult : null
    }
  }

  const googleResult = await executeGoogleTool(name, args, options)
  if (googleResult) return googleResult

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
      const projectId = String(args.projectId)
      const created = (await client.addMemory(projectId, {
        type: String(args.type),
        content: String(args.content),
        title: args.title ? String(args.title) : undefined,
        tags: Array.isArray(args.tags) ? (args.tags as string[]) : undefined,
        // Personal projects bucket by Folk category, not the type enum.
        personalCategory: args.personalCategory ? String(args.personalCategory) : undefined,
        // Attribute in-app assistant ("Ask Relay") captures so the memory
        // list can show provenance.
        sourceSurface: "ask_relay"
      })) as { id?: string; title?: string | null; content?: string }
      const label = created.title || (created.content ?? String(args.content)).slice(0, 80)
      const item = { ...actionItem(created, label), id: created.id, label, projectId }
      const actionResult: AssistantActionResult = {
        tool: "add_memory",
        action: "created",
        entity: "memory item",
        count: 1,
        items: [item],
        previews: [{ after: item }],
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
      let previews: Awaited<ReturnType<typeof previewAssistantTool>> = []
      try {
        previews = await previewAssistantTool(client, name, args)
      } catch {
        // preview fetch failed — proceed without before/after diff
      }
      await client.manageMemory(args)
      const actionResult: AssistantActionResult = {
        tool: "manage_memory",
        action: action === "delete" ? "deleted" : "updated",
        entity: "memory item",
        count: ids.length,
        items: previews.map((preview, index) =>
          actionItem(preview.after ?? preview.before, ids[index] ?? `item-${index}`),
        ),
        previews,
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
