import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { z } from "zod"

import { isAuthRequiredError, resolveViewer, type Viewer } from "@/server/policies/viewer"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"
import { createRepositoryBundle } from "@relay/db"
import { detectCrossSurfaceDrifts } from "@/server/services/drift-reconciler"
import { sweepOpenWorkSessions } from "@/server/services/work-session-flush-service"
import { RelayHttpMcpClient } from "./relay-http-mcp-client"
import { RELAY_MCP_PROMPT_NAMES, RELAY_MCP_RESOURCE_URIS, RELAY_MCP_SERVER_NAME, RELAY_MCP_SERVER_VERSION, RELAY_MCP_TOOL_NAMES } from "@/server/mcp/metadata"

/**
 * Opportunistic sweep throttle. Per-user in-memory map of last sweep timestamp.
 * Keeps the sweep cheap and bounded — at most one sweep per user per window.
 * Map is process-local; a new edge/lambda instance gets a fresh map, which is
 * fine: the sweep is idempotent and the worst case is "one extra sweep per
 * cold start".
 */
const SWEEP_THROTTLE_MS = 30_000
/** Sweep sessions that have been idle for at least this long. */
const SWEEP_IDLE_MS = 10 * 60 * 1000
/** Max sessions flushed per sweep — bounds the latency ceiling. */
const SWEEP_MAX_SESSIONS = 3
const lastSweepAt = new Map<string, number>()

async function maybeSweepStaleSessions(viewer: Viewer): Promise<void> {
  const key = viewer.userId
  const now = Date.now()
  const last = lastSweepAt.get(key) ?? 0
  if (now - last < SWEEP_THROTTLE_MS) return
  lastSweepAt.set(key, now)

  try {
    await sweepOpenWorkSessions(viewer.userId, {
      projectId: viewer.projectId ?? null,
      idleMs: SWEEP_IDLE_MS,
      limit: SWEEP_MAX_SESSIONS,
      reason: "sweep",
    })
  } catch {
    // Sweep failures must not impact the caller's request.
  }

  // Cross-surface drift detection: piggyback on the sweep cadence so we pay
  // one drift scan per user per throttle window, not per request.
  if (viewer.projectId) {
    try {
      const repos = createRepositoryBundle(viewer.userId)
      await detectCrossSurfaceDrifts(repos, viewer.projectId, { userId: viewer.userId })
    } catch {
      // Drift reconciler failures must not impact the caller's request.
    }
  }
}

async function resolveViewerFromRequest(request: Request): Promise<Viewer> {
  const authHeader = request.headers.get("authorization")
    ?? (request.headers.get("token") ? `Bearer ${request.headers.get("token")}` : null)
  return resolveViewer(authHeader)
}

function createHttpMcpServer(viewer: Viewer) {
  const client = new RelayHttpMcpClient(viewer)
  const server = new McpServer({
    name: RELAY_MCP_SERVER_NAME,
    version: RELAY_MCP_SERVER_VERSION
  })

  const projectId = viewer.projectId

  async function resolveProjectId(explicitId?: string): Promise<string> {
    if (explicitId) return explicitId
    if (projectId) return projectId
    throw new Error(
      "Could not determine project. Call list_projects to see your projects, then call set_current_project with the correct projectId — or pass projectId explicitly."
    )
  }

  registerHttpTools(server, client, resolveProjectId, viewer)
  registerHttpPrompts(server)
  registerHttpResources(server)

  return server
}

function registerHttpTools(
  server: McpServer,
  client: RelayHttpMcpClient,
  resolveProjectId: (explicitId?: string) => Promise<string>,
  viewer: Viewer
) {
  server.tool(
    RELAY_MCP_TOOL_NAMES[0],
    "List all Relay projects you have access to. Returns project IDs, names, slugs, and descriptions. Call this first to find a project ID and to match the user's current working directory or repository against project names and slugs before calling get_brief.",
    {
      limit: z.number().optional().describe("Maximum number of projects to return"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async (args) => {
      let projects = await client.listProjects()
      if (args.limit && args.limit > 0) projects = projects.slice(0, args.limit)
      return {
        content: [{ type: "text" as const, text: JSON.stringify(projects, null, 2) }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[1],
    "Switch the current Relay project for this token. Use this when the user is clearly working on a different project than the cached one. The switch persists across future MCP calls with the same token. Call list_projects first to find the correct projectId.",
    {
      projectId: z.string().uuid().describe("The ID of the project to switch to."),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async (args) => {
      if (!viewer.mcpTokenId) {
        throw new Error("Cannot switch project: no MCP token id on the current viewer.")
      }
      const { createRepositoryBundle } = await import("@relay/db")
      const repositories = createRepositoryBundle(viewer.userId)
      const project = await repositories.projects.getById(args.projectId)
      if (!project) {
        throw new Error("Project not found or not accessible to the current MCP user.")
      }
      await repositories.mcpTokens.setProjectId(viewer.mcpTokenId, args.projectId)
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: true, projectId: args.projectId }, null, 2),
          },
        ],
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[2],
    `Fetch a project context brief from Relay. Returns a markdown document with project state, decisions, constraints, tasks, and key memory items formatted for an AI coding session.

IMPORTANT — before calling get_brief, always verify which project the user is working on:
1. Call list_projects to see all available projects.
2. Match the current working directory / git repository against the project names and slugs.
3. If the cached project is wrong, call set_current_project with the correct projectId.
4. Only then call get_brief.

Call this at the start of every coding session to restore project memory.`,
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      kind: z.string().optional().describe("Brief kind: fresh_chat_bootstrap or quick_continuity"),
      targetProfileKey: z.string().optional().describe("Target profile key for formatting"),
      generate: z.boolean().optional().describe("Whether to generate a new brief or fetch the latest cached one."),
      include: z.array(z.string()).optional().describe("Extra sections to include in the brief"),
      since: z.string().optional().describe("Only include context updated since this ISO timestamp."),
      syncSurface: z.string().optional().describe("Surface label used to update last-sync markers."),
    },
    { readOnlyHint: true, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const brief = await client.getBrief(pid, args as Record<string, unknown>)
      return {
        content: [{ type: "text" as const, text: brief }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[3],
    "Get full structured project state including overview, objectives, decisions, constraints, and tasks.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const state = await client.getProjectState(pid)
      return {
        content: [{ type: "text" as const, text: JSON.stringify(state, null, 2) }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[4],
    "List project memory items with filters for type, archive state, pinned status, or tag. Use this when the user asks what Relay currently knows, or before choosing a memory item to update or archive.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      archived: z.boolean().optional().describe("Include archived memory items."),
      pinned: z.boolean().optional().describe("Filter by pinned status."),
      tag: z.string().optional().describe("Filter by a specific tag."),
      types: z.array(z.string()).optional().describe("Filter by memory item types."),
      limit: z.number().optional().describe("Maximum number of items to return."),
      sort: z.enum(["updated_desc", "created_desc"]).optional().describe("Sort order."),
    },
    { readOnlyHint: true, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const items = await client.listMemory(pid, args)
      return {
        content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[5],
    "Get one memory item by ID, including provenance, conflict status, and relation metadata. Use after list_memory or search_context when you need to inspect an item before mutating it.",
    {
      memoryId: z.string().uuid().describe("Memory item ID."),
    },
    { readOnlyHint: true, destructiveHint: false },
    async (args) => {
      const item = await client.getMemory(args.memoryId, viewer.projectId ?? undefined)
      if (!item) {
        throw new Error("Memory item not found or not accessible to the current MCP user.")
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(item, null, 2) }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[6],
    "Search memory items by keyword or semantic query. Returns matching decisions, constraints, tasks, notes, and other memory items.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      query: z.string().describe("Search query to find relevant memory items"),
      types: z.array(z.string()).optional().describe("Filter by memory types: decision, constraint, task, note, artifact, requirement"),
      tags: z.array(z.string()).optional().describe("Filter by tags attached to memory items"),
      limit: z.number().optional().describe("Maximum number of results to return"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const results = await client.searchMemory(pid, args.query, {
        types: args.types,
        tags: args.tags,
        limit: args.limit,
      })
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[7],
    "List captured source sessions and Relay work sessions that currently influence continuity. Use this when the user asks what captures Relay has, or when debugging stale context.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      includeArchived: z.boolean().optional().describe("Include archived source sessions and closed work sessions."),
      surfaces: z.array(z.string()).optional().describe("Optional surface filters."),
      limit: z.number().optional().describe("Maximum number of sessions to return per session family."),
    },
    { readOnlyHint: true, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const sessions = await client.listSessions(pid, args)
      return {
        content: [{ type: "text" as const, text: JSON.stringify(sessions, null, 2) }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[8],
    "Archive or restore a captured source session. Use this to detach stale or polluted captures from the continuity pipeline.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      sessionId: z.string().uuid().describe("Source session ID to archive or restore."),
      archived: z.boolean().optional().describe("Archive when true, restore when false."),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const session = await client.archiveSession(pid, args.sessionId, args.archived !== false)
      return {
        content: [{ type: "text" as const, text: JSON.stringify(session, null, 2) }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[9],
    "List generated Relay brief packets for the current project, including profile, kind, created time, and edited status.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      limit: z.number().optional().describe("Maximum number of brief packets to return."),
    },
    { readOnlyHint: true, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const packets = await client.listBriefs(pid, args)
      return {
        content: [{ type: "text" as const, text: JSON.stringify(packets, null, 2) }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[10],
    "Regenerate a project brief packet explicitly. Use this after cleanup or when the user wants a fresh brief instead of reusing cached continuity.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      kind: z.string().optional().describe("Brief kind: fresh_chat_bootstrap or quick_continuity"),
      targetProfileKey: z.string().optional().describe("Target profile key for formatting"),
      since: z.string().optional().describe("Only include context updated since this ISO timestamp."),
      syncSurface: z.string().optional().describe("Surface label used to update last-sync markers."),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const packet = await client.regenerateBrief(pid, args as Record<string, unknown>)
      return {
        content: [{ type: "text" as const, text: JSON.stringify(packet, null, 2) }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[11],
    "Delete a specific brief packet by ID. Use this to remove stale or polluted generated briefs before regenerating.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      packetId: z.string().uuid().describe("Brief packet ID to delete."),
    },
    { readOnlyHint: false, destructiveHint: true },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      await client.deleteBrief(pid, args.packetId)
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ ok: true, packetId: args.packetId }, null, 2) }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[12],
    "Trace why a phrase or project-state field appears in Relay context. Returns likely contributing memory items, digests, canon entries, sessions, summary snapshots, and briefs.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      query: z.string().optional().describe("Phrase or brief text to trace back to likely sources."),
      stateField: z.string().optional().describe("Structured project-state field to trace, such as currentObjective or decisions[0]."),
      limit: z.number().optional().describe("Maximum number of matches per source family."),
    },
    { readOnlyHint: true, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      if (!args.query && !args.stateField) {
        throw new Error("Provide query or stateField.")
      }
      const trace = await client.traceContext(pid, args)
      return {
        content: [{ type: "text" as const, text: JSON.stringify(trace, null, 2) }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[13],
    "List recent continuity activity such as captures, digests, memory mutations, work-session events, and brief generation. Use this to answer what changed recently.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      limit: z.number().optional().describe("Maximum number of activity entries to return."),
    },
    { readOnlyHint: true, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const activity = await client.listRecentActivity(pid, args)
      return {
        content: [{ type: "text" as const, text: JSON.stringify(activity, null, 2) }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[14],
    "Add a memory item to the project. Use this to persist decisions, constraints, tasks, or notes discovered during the session.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      type: z.string().describe("Memory type: decision, constraint, task, note, artifact, or requirement"),
      content: z.string().describe("The memory content to store"),
      title: z.string().optional().describe("Short title for the memory item"),
      tags: z.array(z.string()).optional().describe("Tags for categorizing and searching"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const item = await client.addMemory(pid, {
        type: args.type,
        content: args.content,
        title: args.title,
        tags: args.tags,
      })
      return {
        content: [{ type: "text" as const, text: JSON.stringify(item, null, 2) }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[15],
    `Push a structured session snapshot into Relay and run it through the digest + reconcile pipeline. You do NOT need to call this at natural break points — Relay auto-flushes via supported client hooks (relay-flush), stdio shutdown, and an opportunistic server-side sweep that runs before every MCP request. Call explicitly only for an immediate checkpoint or when ending a session on a hookless client. Set finalize=false to record state without closing the session.`,
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      summary: z.string().optional().describe("High-level session summary"),
      decisions: z.array(z.string()).optional().describe("Decisions made during the session"),
      progress: z.string().optional().describe("Description of progress made"),
      nextSteps: z.array(z.string()).optional().describe("Tasks or next steps identified"),
      constraints: z.array(z.string()).optional().describe("Constraints discovered during the session"),
      notes: z.array(z.string()).optional().describe("General notes or observations"),
      currentObjective: z.string().optional().describe("Current objective or focus for the project"),
      relevantTools: z.array(z.string()).optional().describe("Tools, frameworks, or surfaces relevant to the session"),
      touchedFiles: z.array(z.string()).optional().describe("Files materially touched during the session"),
      finalize: z.boolean().optional().describe("When true (default), flush + close the work session after saving."),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      await client.saveContext(pid, args as Record<string, unknown>)
      const finalized = args.finalize !== false
      return {
        content: [
          {
            type: "text" as const,
            text: finalized
              ? "Relay: session flushed through digest + reconcile pipeline."
              : "Relay: checkpoint saved. Will flush on next finalize or hook trigger.",
          },
        ],
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[16],
    "Mid-session snapshot: identical payload to save_context but never closes the work session. Relay will flush automatically at the next hook/shutdown/sweep.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      summary: z.string().optional().describe("High-level session summary"),
      decisions: z.array(z.string()).optional().describe("Decisions made during the session"),
      progress: z.string().optional().describe("Description of progress made"),
      nextSteps: z.array(z.string()).optional().describe("Tasks or next steps identified"),
      constraints: z.array(z.string()).optional().describe("Constraints discovered during the session"),
      notes: z.array(z.string()).optional().describe("General notes or observations"),
      currentObjective: z.string().optional().describe("Current objective or focus for the project"),
      relevantTools: z.array(z.string()).optional().describe("Tools, frameworks, or surfaces relevant to the session"),
      touchedFiles: z.array(z.string()).optional().describe("Files materially touched during the session"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      await client.saveContext(pid, { ...(args as Record<string, unknown>), finalize: false })
      return {
        content: [
          { type: "text" as const, text: "Relay: checkpoint saved. Will flush on next hook/shutdown/sweep." },
        ],
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[17],
    "Update, delete, or archive an existing memory item by its ID.",
    {
      action: z.string().describe("Action to perform: update, delete, or archive"),
      memoryId: z.string().describe("The ID of the memory item to manage"),
      content: z.string().optional().describe("New content (for update action)"),
      title: z.string().optional().describe("New title (for update action)"),
      tags: z.array(z.string()).optional().describe("New tags (for update action)"),
    },
    { readOnlyHint: false, destructiveHint: true },
    async (args) => {
      await client.manageMemory(args as Record<string, unknown>)
      return {
        content: [{ type: "text" as const, text: `Memory item ${args.action}d successfully.` }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[18],
    "Upsert the high-level project state used for briefs and dashboard overview. Use this when bootstrapping or correcting canonical project context from an agent session. Omitted scalar fields stay unchanged; list fields merge uniquely unless replaceLists is true.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      projectOverview: z.string().optional().describe("High-level description of what the project is."),
      currentObjective: z.string().optional().describe("Current goal or focus area for the project."),
      recentProgress: z.string().optional().describe("Recent progress worth carrying forward."),
      stackDomain: z.string().optional().describe("Short stack or domain summary."),
      decisions: z.array(z.string()).optional().describe("Durable project decisions to merge into state."),
      constraints: z.array(z.string()).optional().describe("Constraints to merge into project state."),
      openTasks: z.array(z.string()).optional().describe("Open tasks to merge into project state."),
      relevantTools: z.array(z.string()).optional().describe("Relevant tools, platforms, or surfaces to merge into state."),
      replaceLists: z.boolean().optional().describe("Replace list fields instead of merging them uniquely."),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const state = await client.setProjectState(pid, args as Record<string, unknown>)
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ state }, null, 2) }],
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[19],
    "Update a project's name or description.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      name: z.string().optional().describe("New project name"),
      description: z.string().optional().describe("New project description"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      await client.updateProject(pid, {
        name: args.name,
        description: args.description,
      })
      return {
        content: [{ type: "text" as const, text: "Project updated successfully." }]
      }
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[20],
    "Search memory and retrieve project state in one call. Use before making decisions to check for existing constraints and context.",
    {
      projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
      query: z.string().describe("What to search for in project memory"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      const result = await client.recallContext(pid, args.query)
      return {
        content: [{ type: "text" as const, text: result }]
      }
    }
  )
}

const SESSION_GUIDELINES = `# Relay Session Guidelines

You have access to Relay, a project memory system that keeps context synchronized across coding sessions and AI tools.

## Recommended Workflow

### At Session Start
1. Call \`list_projects\` to see all available projects.
2. Match the user's current working directory / git repository against the project names and slugs.
3. If the cached project is wrong, call \`set_current_project\` with the correct projectId.
4. Call \`get_brief\` to load the current project context, decisions, constraints, and recent progress.

### During the Session
- Before making architectural decisions, call \`recall_context\` to check for existing decisions or constraints.
- When the user makes a new decision or identifies a task, call \`add_memory\` to persist it immediately.
- Use \`search_context\` to check for duplicates before adding.
- If Relay context looks stale or wrong, inspect it before mutating:
  use \`list_memory\`, \`list_sessions\`, \`list_briefs\`, \`trace_context_sources\`, and \`list_recent_activity\`.

### At Session End
- Call \`memory.save_context\` with a structured summary of what was accomplished, new decisions, and next steps.

## Memory Types
- **decision**: Architectural or implementation choices
- **constraint**: Hard limits or requirements
- **task**: Actionable next steps
- **note**: General observations or context
- **requirement**: Product or business requirements
- **artifact**: Code snippets, schemas, or reference material
`

function registerHttpPrompts(server: McpServer) {
  server.prompt(
    RELAY_MCP_PROMPT_NAMES[0],
    "Guidelines for using Relay tools effectively during a coding session.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: SESSION_GUIDELINES },
        },
      ],
    })
  )
}

function registerHttpResources(server: McpServer) {
  server.resource(
    "session_guidelines",
    RELAY_MCP_RESOURCE_URIS[0],
    { description: "Relay session guidelines for AI coding tools", mimeType: "text/markdown" },
    async () => ({
      contents: [{ uri: RELAY_MCP_RESOURCE_URIS[0], text: SESSION_GUIDELINES, mimeType: "text/markdown" }],
    })
  )
}

async function handleMcpRequest(request: Request) {
  await assertIpRateLimit(request, "mcp_stream_ip", 30)

  let viewer: Viewer
  try {
    viewer = await resolveViewerFromRequest(request)
  } catch (error) {
    if (isAuthRequiredError(error)) {
      return new Response(JSON.stringify({ error: "unauthorized", message: "Valid MCP token required. Run npx @onrelay/wizard to get one." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }
    throw error
  }

  // Opportunistic sweep: flush stale open work sessions before this request
  // runs so stale state from a prior crashed/orphaned session doesn't leak
  // into the agent's view. Runs at most once per user per SWEEP_THROTTLE_MS.
  await maybeSweepStaleSessions(viewer)

  const server = createHttpMcpServer(viewer)

  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  })

  await server.connect(transport)

  try {
    return await transport.handleRequest(request)
  } finally {
    await transport.close()
    await server.close()
  }
}

export async function POST(request: Request) {
  return handleMcpRequest(request)
}

export async function GET(request: Request) {
  return handleMcpRequest(request)
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request)
}
