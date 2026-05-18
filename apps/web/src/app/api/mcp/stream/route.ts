import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { resolveRelayProjectSelection, sourceLifecycleActions, type RelayProjectResolutionResult } from "@relay/shared"
import { z } from "zod"

import { isAuthRequiredError, resolveViewer, type Viewer } from "@/server/policies/viewer"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"
import { consumeQuota, resolveViewerEntitlements } from "@/server/services/entitlement-service"
import { createRepositoryBundle } from "@relay/db"
import { detectCrossSurfaceDrifts } from "@/server/services/drift-reconciler"
import { sweepOpenWorkSessions } from "@/server/services/work-session-flush-service"
import { captureServerEvent } from "@/lib/telemetry/posthog-server"
import { fireUserMilestone } from "@/server/services/user-milestones-service"
import { RelayHttpMcpClient } from "./relay-http-mcp-client"
import { RELAY_MCP_PROMPT_NAMES, RELAY_MCP_RESOURCE_URIS, RELAY_MCP_SERVER_NAME, RELAY_MCP_SERVER_VERSION } from "@/server/mcp/metadata"

/**
 * Opportunistic sweep throttle. Per-user in-memory map of last sweep timestamp.
 * Keeps the sweep cheap and bounded — at most one sweep per user per window.
 * Map is process-local; a new edge/lambda instance gets a fresh map, which is
 * fine: the sweep is idempotent and the worst case is "one extra sweep per
 * cold start".
 */
const SWEEP_THROTTLE_MS = 30 * 60 * 1000
/** Sweep sessions that have been idle for at least this long. */
const SWEEP_IDLE_MS = 10 * 60 * 1000
/** Max sessions flushed per sweep — bounds the latency ceiling. */
const SWEEP_MAX_SESSIONS = 1
const MCP_READ_TELEMETRY_SAMPLE_RATE = 0.1
const lastSweepAt = new Map<string, number>()
const SOURCES_TOOL_NAME = "sources"

// Legacy split names are still referenced by the old handler definitions below.
// The public hosted surface is gated to the same six stdio tools, so these
// internal registrations are ignored until the hosted route is fully collapsed.
const RELAY_MCP_TOOL_NAMES = [
  "list_projects",
  "set_current_project",
  "get_brief",
  "get_project_state",
  "list_memory",
  "get_memory",
  "search_context",
  "list_sessions",
  "archive_session",
  "list_briefs",
  "regenerate_brief",
  "delete_brief",
  "trace_context_sources",
  "list_recent_activity",
  "add_memory",
  "save_context",
  "checkpoint_context",
  "manage_memory",
  "set_project_state",
  "update_project",
  "recall_context",
] as const

const HOSTED_PUBLIC_TOOL_NAMES = new Set(["list_projects", "set_current_project", "get_brief", "recall", "sources", "save"])
const memoryTypeSchema = z.enum(["decision", "constraint", "task", "note", "artifact", "requirement"])
const recallToolShape = {
  projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)."),
  query: z.string().optional().describe("Search query across project memory and state."),
  memoryId: z.string().optional().describe("Get a specific memory item by ID."),
  include: z.array(z.enum(["state", "sessions", "activity", "briefs", "trace"])).optional().describe("Additional continuity data to include."),
  filters: z.object({
    types: z.array(memoryTypeSchema).optional(),
    tags: z.array(z.string()).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
  }).optional().describe("Filters for memory listing or search."),
  tracePhrase: z.string().optional().describe("Trace provenance of a phrase in project context."),
}

const saveToolShape = {
  projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)."),
  action: z.enum([
    "save_session",
    "checkpoint",
    "add_memory",
    "manage_memory",
    "set_state",
    "update_project",
    "archive_session",
    "regenerate_brief",
    "delete_brief",
  ]).describe("The write action to perform."),
  payload: z.record(z.string(), z.unknown()).describe("Action-specific payload."),
}

const sourcesToolShape = {
  action: z.enum(sourceLifecycleActions),
  projectId: z.string().optional().describe("Project ID (uses token-scoped project if omitted)"),
  sourceId: z.string().optional().describe("Source ID for status, read, refresh, promote, delete, or purge."),
  chunkId: z.string().optional().describe("Source chunk ID for read or promote."),
  url: z.string().optional().describe("Public https URL to index."),
  query: z.string().optional().describe("Search query."),
  sourceType: z.enum(["website", "llms_txt", "pdf", "arxiv", "openapi", "package_docs", "github_repo"]).optional(),
  refreshPolicy: z.enum(["manual", "daily", "weekly"]).optional(),
  registry: z.enum(["npm", "py_pi", "crates_io", "go", "ruby_gems"]).optional(),
  manifestFileName: z.string().optional(),
  manifestContent: z.string().optional(),
  tokenBudget: z.number().optional(),
  importProvider: z.enum(["context7", "nia", "external"]).optional(),
  providerSourceId: z.string().optional(),
  citations: z.array(z.object({
    title: z.string(),
    url: z.string(),
    content: z.string(),
    locator: z.record(z.string(), z.unknown()).optional(),
  })).optional(),
  displayName: z.string().optional(),
  limit: z.number().optional(),
  type: z.enum(["note", "decision", "constraint", "requirement", "task", "artifact"]).optional(),
  title: z.string().optional(),
  content: z.string().optional(),
}

type HostedToolResult = {
  content: Array<{ type: "text"; text: string }>
  structuredContent?: Record<string, unknown>
}

function textResult(text: string): HostedToolResult {
  return { content: [{ type: "text", text }] }
}

function jsonResult(value: unknown): HostedToolResult {
  return textResult(JSON.stringify(value, null, 2))
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required.`)
  }
  return value
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function optionalStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined
}

async function runHostedRecall(
  client: RelayHttpMcpClient,
  projectId: string,
  args: {
    query?: string
    memoryId?: string
    include?: Array<"state" | "sessions" | "activity" | "briefs" | "trace">
    filters?: {
      types?: Array<"decision" | "constraint" | "task" | "note" | "artifact" | "requirement">
      tags?: string[]
      pinned?: boolean
      archived?: boolean
    }
    tracePhrase?: string
  },
): Promise<HostedToolResult> {
  const sections: string[] = []
  const include = args.include ?? []

  if (args.memoryId) {
    const item = await client.getMemory(args.memoryId, projectId)
    if (!item) throw new Error("Memory item not found or not accessible to the current MCP user.")
    sections.push(JSON.stringify(item, null, 2))
  }

  if (args.query) {
    sections.push(await client.recallContext(projectId, args.query))
  } else if (!args.memoryId && include.length === 0 && !args.tracePhrase && !args.filters) {
    sections.push(JSON.stringify(await client.getProjectState(projectId), null, 2))
  }

  if (args.filters && !args.query) {
    sections.push(JSON.stringify(await client.listMemory(projectId, {
      types: args.filters.types,
      tag: args.filters.tags?.[0],
      pinned: args.filters.pinned,
      archived: args.filters.archived,
    }), null, 2))
  }

  if (args.query && args.filters) {
    sections.push(JSON.stringify(await client.searchMemory(projectId, args.query, {
      types: args.filters.types,
      tags: args.filters.tags,
    }), null, 2))
  }

  if (include.includes("state") && !args.query) {
    sections.push(JSON.stringify(await client.getProjectState(projectId), null, 2))
  }

  if (include.includes("sessions")) {
    sections.push(JSON.stringify(await client.listSessions(projectId), null, 2))
  }

  if (include.includes("activity")) {
    sections.push(JSON.stringify(await client.listRecentActivity(projectId), null, 2))
  }

  if (include.includes("briefs")) {
    sections.push(JSON.stringify(await client.listBriefs(projectId), null, 2))
  }

  if (args.tracePhrase || include.includes("trace")) {
    const phrase = args.tracePhrase ?? args.query ?? ""
    if (phrase) {
      sections.push(JSON.stringify(await client.traceContext(projectId, { query: phrase }), null, 2))
    }
  }

  if (sections.length === 0) {
    sections.push(JSON.stringify(await client.getProjectState(projectId), null, 2))
  }

  return textResult(sections.join("\n\n---\n\n"))
}

async function runHostedSave(
  client: RelayHttpMcpClient,
  projectId: string,
  args: { action: string; payload: Record<string, unknown> },
): Promise<HostedToolResult> {
  const payload: Record<string, unknown> = { ...args.payload, projectId }

  if (args.action === "save_session") {
    await client.saveContext(projectId, { ...payload, finalize: payload.finalize !== false })
    return textResult("Relay: session flushed through digest + reconcile pipeline.")
  }

  if (args.action === "checkpoint") {
    await client.saveContext(projectId, { ...payload, finalize: false })
    return textResult("Relay: checkpoint saved. Will flush on next finalize or hook trigger.")
  }

  if (args.action === "add_memory") {
    const type = memoryTypeSchema.parse(payload.type)
    const item = await client.addMemory(projectId, {
      type,
      content: requiredString(payload.content, "payload.content"),
      title: optionalString(payload.title),
      tags: optionalStringArray(payload.tags),
    })
    return jsonResult(item)
  }

  if (args.action === "manage_memory") {
    await client.manageMemory(payload)
    return textResult(`Memory item ${String(payload.action ?? "managed")} successfully.`)
  }

  if (args.action === "set_state") {
    return jsonResult({ state: await client.setProjectState(projectId, payload) })
  }

  if (args.action === "update_project") {
    await client.updateProject(projectId, {
      name: optionalString(payload.name),
      description: optionalString(payload.description),
    })
    return textResult("Project updated successfully.")
  }

  if (args.action === "archive_session") {
    const session = await client.archiveSession(projectId, requiredString(payload.sessionId, "payload.sessionId"), payload.archived !== false)
    return jsonResult(session)
  }

  if (args.action === "regenerate_brief") {
    return jsonResult(await client.regenerateBrief(projectId, payload))
  }

  if (args.action === "delete_brief") {
    const packetId = requiredString(payload.packetId, "payload.packetId")
    await client.deleteBrief(projectId, packetId)
    return jsonResult({ ok: true, packetId })
  }

  throw new Error(`Unsupported save action: ${args.action}`)
}

export const maxDuration = 60

function shouldCaptureMcpToolTelemetry(readOrWrite: "read" | "write") {
  return readOrWrite === "write" || Math.random() < MCP_READ_TELEMETRY_SAMPLE_RATE
}

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

  let currentProjectId = viewer.projectId ?? null

  async function resolveProjectSelection(explicitId?: string): Promise<RelayProjectResolutionResult> {
    if (explicitId) {
      return {
        status: "resolved",
        projectId: explicitId,
        source: "explicit",
        confidence: 1,
        needsUserIntervention: false,
      }
    }

    const projects = await client.listProjects()
    return resolveRelayProjectSelection({
      cachedProjectId: currentProjectId,
      tokenProjectId: viewer.projectId ?? null,
      projects,
    })
  }

  async function resolveProjectId(explicitId?: string): Promise<string> {
    const result = await resolveProjectSelection(explicitId)
    if (result.status === "resolved") return result.projectId
    throw new Error(
      "Relay could not confidently determine the active project. Call list_projects to inspect candidates, then call set_current_project with the correct projectId."
    )
  }

  registerHttpTools(server, client, resolveProjectId, resolveProjectSelection, viewer, () => currentProjectId, (projectId) => {
    currentProjectId = projectId
  })
  registerHttpPrompts(server)
  registerHttpResources(server)

  return server
}

function registerHttpTools(
  server: McpServer,
  client: RelayHttpMcpClient,
  resolveProjectId: (explicitId?: string) => Promise<string>,
  resolveProjectSelection: (explicitId?: string) => Promise<RelayProjectResolutionResult>,
  viewer: Viewer,
  getCurrentProjectId: () => string | null,
  setCurrentProjectId: (projectId: string) => void,
) {
  const writeTools = new Set<string>(["set_current_project", "save"])
  const originalTool = server.tool.bind(server)

  ;(server as McpServer & { tool: typeof server.tool }).tool = ((name: string, description: string, schema: unknown, maybeHintsOrHandler: unknown, maybeHandler?: unknown) => {
    if (!HOSTED_PUBLIC_TOOL_NAMES.has(name)) {
      return undefined as unknown as ReturnType<typeof originalTool>
    }

    const hasHints = typeof maybeHandler === "function"
    const hints = hasHints ? maybeHintsOrHandler : undefined
    const handler = (hasHints ? maybeHandler : maybeHintsOrHandler) as (args: Record<string, unknown>) => Promise<unknown>

    const wrapped = async (args: Record<string, unknown>) => {
      const initialProjectId =
        typeof args?.projectId === "string"
          ? args.projectId
          : getCurrentProjectId()
      const initialResolutionSource =
        typeof args?.projectId === "string"
          ? "explicit"
          : viewer.projectId
            ? "token"
            : getCurrentProjectId()
              ? "cached"
              : null
      const readOrWrite =
        name === SOURCES_TOOL_NAME && ["index", "refresh", "promote", "import", "delete", "purge"].includes(String(args?.action ?? ""))
          ? "write"
          : writeTools.has(name) ? "write" : "read"

      const entitlements = await resolveViewerEntitlements(viewer.userId)
      const quotaKey = readOrWrite === "write" ? "mcp_write_daily" : "mcp_read_daily"
      const quotaLimit = readOrWrite === "write" ? entitlements.limits.mcpWriteDaily : entitlements.limits.mcpReadDaily
      await consumeQuota(viewer.userId, quotaKey, "day", quotaLimit, 1, entitlements.plan)
      if (name === SOURCES_TOOL_NAME) {
        await consumeQuota(
          viewer.userId,
          "external_source_mcp_action_minute",
          "minute",
          entitlements.limits.externalSourceMcpActionsPerMinute,
          1,
          entitlements.plan,
        )
      }

      const captureToolTelemetry = shouldCaptureMcpToolTelemetry(readOrWrite)

      if (captureToolTelemetry) {
        captureServerEvent({
          event: "mcp_tool_called",
          distinctId: viewer.userId,
          properties: {
            tool_name: name,
            transport: "http",
            read_or_write: readOrWrite,
            project_id: initialProjectId ?? null,
            project_resolution_source: initialResolutionSource,
            client_name: "relay-mcp-http",
            success: true,
          },
        })
      }

      try {
        const result = await handler(args)
        const structuredContent = result && typeof result === "object" && "structuredContent" in result
          ? (result as { structuredContent?: Record<string, unknown> }).structuredContent
          : undefined
        const resolution = structuredContent?.projectResolution as Record<string, unknown> | undefined
        const resolvedProjectId =
          typeof resolution?.projectId === "string"
            ? resolution.projectId
            : initialProjectId
        const resolutionSource =
          typeof resolution?.source === "string"
            ? resolution.source
            : initialResolutionSource

        if (captureToolTelemetry) {
          captureServerEvent({
            event: "mcp_tool_completed",
            distinctId: viewer.userId,
            properties: {
              tool_name: name,
              transport: "http",
              read_or_write: readOrWrite,
              project_id: resolvedProjectId ?? null,
              project_resolution_source: resolutionSource,
              client_name: "relay-mcp-http",
              success: true,
            },
          })
        }

        return result
      } catch (error) {
        captureServerEvent({
          event: "mcp_tool_failed",
          distinctId: viewer.userId,
          properties: {
            tool_name: name,
            transport: "http",
            read_or_write: readOrWrite,
            project_id: initialProjectId ?? null,
            project_resolution_source: initialResolutionSource,
            client_name: "relay-mcp-http",
            success: false,
          },
        })
        throw error
      }
    }

    if (hasHints) {
      return originalTool(name, description, schema as never, hints as never, wrapped as never)
    }
    return originalTool(name, description, schema as never, wrapped as never)
  }) as typeof server.tool

  server.tool(
    RELAY_MCP_TOOL_NAMES[0],
    "List all Relay projects you have access to. Returns project IDs, names, slugs, routing keywords, and which project is currently active for this MCP session. Do not call this before the first get_brief unless Relay explicitly reports project ambiguity or resolves to the wrong project.",
    {
      limit: z.number().optional().describe("Maximum number of projects to return"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async (args) => {
      let projects = await client.listProjects()
      projects = projects.map((project) => ({
        ...project,
        isCurrent: getCurrentProjectId() === project.id,
      }))
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
      setCurrentProjectId(args.projectId)
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
    `Fetch a project context brief from Relay. This is the default session-start tool.

- If projectId is omitted, Relay first tries the cached or token-scoped project.
- If that fails, Relay resolves the project only when there is a single obvious candidate.
- Only call list_projects and set_current_project if get_brief reports ambiguity or the wrong project.`,
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
      const resolution = await resolveProjectSelection(args.projectId)
      if (resolution.status !== "resolved") {
        return {
          content: [
            {
              type: "text" as const,
              text: "Relay could not confidently determine the active project. Call list_projects to inspect candidates, then call set_current_project with the correct projectId before retrying get_brief.",
            },
          ],
          structuredContent: resolution as unknown as Record<string, unknown>,
        }
      }

      const brief = await client.getBrief(resolution.projectId, args as Record<string, unknown>)
      return {
        content: [{ type: "text" as const, text: brief.text }],
        structuredContent: {
          projectResolution: resolution,
          ...brief.structured,
        } as Record<string, unknown>,
      }
    }
  )

  server.tool(
    "recall",
    `Unified read tool — replaces recall_context, search_context, get_project_state, list_memory, get_memory, list_sessions, list_recent_activity, trace_context_sources, and list_briefs.

- No params → project state overview
- query → hybrid search + project state
- memoryId → single item detail
- include: ["sessions"] → list sessions
- include: ["activity"] → recent activity
- include: ["briefs"] → list briefs
- tracePhrase → trace provenance of a phrase
- filters → filter memory listing by type/tags/pinned/archived

If returned context is stale, completed, contradicted, or superseded, clean it up with save action: "manage_memory" or correct project state with save action: "set_state".`,
    recallToolShape,
    { readOnlyHint: true, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      return runHostedRecall(client, pid, args)
    }
  )

  server.tool(
    "save",
    `Unified write tool — replaces save_context, checkpoint_context, add_memory, manage_memory, set_project_state, update_project, archive_session, regenerate_brief, and delete_brief.

Actions: save_session, checkpoint, add_memory, manage_memory, set_state, update_project, archive_session, regenerate_brief, delete_brief.

Pass action-specific fields in payload. Use manage_memory whenever get_brief or recall shows stale, completed, contradicted, or superseded context.`,
    saveToolShape,
    { readOnlyHint: false, destructiveHint: true },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      return runHostedSave(client, pid, args)
    }
  )

  server.tool(
    RELAY_MCP_TOOL_NAMES[3],
    "Get full structured project state including overview, objectives, decisions, constraints, and tasks. Use this only when the brief is stale, contradictory, or you specifically need raw structured data for debugging.",
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
      const item = await client.getMemory(args.memoryId, getCurrentProjectId() ?? undefined)
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
    "Search memory items by keyword or semantic query. Returns matching decisions, constraints, tasks, notes, and other memory items. Use this before high-impact decisions or when local context is incomplete, not as a default follow-up to a coherent get_brief result. If search returns no useful memory, investigate locally and save only confirmed durable findings, not the empty search attempt.",
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
    "List captured source sessions and Relay work sessions that currently influence continuity. Use this when the user explicitly asks what Relay captured, or when debugging stale or contradictory continuity. Do not call this for a normal resume when get_brief is coherent.",
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
    "List generated Relay brief packets for the current project, including profile, kind, created time, and edited status. Use this for debugging stale or contradictory continuity, not for a normal resume when get_brief succeeded.",
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
      type: z.enum(["decision", "constraint", "task", "note", "artifact", "requirement"]).describe("Memory type"),
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
    `Push a structured session snapshot into Relay and run it through the digest + reconcile pipeline. You do NOT need to call this at natural break points — Relay auto-flushes via supported client hooks, stdio shutdown, and an opportunistic server-side sweep that runs before MCP requests. Call explicitly only for an immediate checkpoint, a meaningful wrap-up, or when ending a session on a hookless client. Set finalize=false to record state without closing the session.`,
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
      action: z.enum(["update", "delete", "archive"]).describe("Action to perform"),
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
    "Search memory and retrieve project state in one call. Use before making decisions to check for existing constraints and context. If recall returns no useful memory, investigate locally and save only confirmed durable findings, not the empty recall attempt.",
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

  server.tool(
    SOURCES_TOOL_NAME,
    "Project-governed source lifecycle for Relay docs and repository sources. Use resolve to find evidence-backed source candidates, index to add URLs, search/read/explore/grep/context_pack to retrieve citations, import to store external Context7/Nia citations, refresh to update indexed sources, and promote only when the user wants a citation saved into durable memory.",
    sourcesToolShape,
    { readOnlyHint: false, destructiveHint: false },
    async (args) => {
      const pid = await resolveProjectId(args.projectId)
      if (args.action === "list") {
        return { content: [{ type: "text" as const, text: JSON.stringify(await client.listSources(pid), null, 2) }] }
      }
      if (args.action === "index") {
        if (!args.url) throw new Error("url is required for sources action:index.")
        const result = await client.createExternalSource(pid, args)
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], structuredContent: result as unknown as Record<string, unknown> }
      }
      if (args.action === "resolve") {
        if (!args.query) throw new Error("query is required for sources action:resolve.")
        const result = await client.resolveSources(pid, args)
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], structuredContent: result as unknown as Record<string, unknown> }
      }
      if (args.action === "search") {
        if (!args.query) throw new Error("query is required for sources action:search.")
        const result = await client.searchSources(pid, args)
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], structuredContent: result as unknown as Record<string, unknown> }
      }
      if (args.action === "context_pack") {
        if (!args.query) throw new Error("query is required for sources action:context_pack.")
        const result = await client.buildSourceContextPack(pid, args)
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], structuredContent: result as unknown as Record<string, unknown> }
      }
      if (args.action === "explore") {
        const result = await client.exploreSources(pid, args)
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], structuredContent: result as unknown as Record<string, unknown> }
      }
      if (args.action === "grep") {
        if (!args.query) throw new Error("query is required for sources action:grep.")
        const result = await client.grepSources(pid, args)
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], structuredContent: result as unknown as Record<string, unknown> }
      }
      if (args.action === "status" || args.action === "read") {
        if (!args.sourceId) throw new Error("sourceId is required for this sources action.")
        const result = await client.getSourceDetail(pid, args.sourceId, {
          chunkId: args.action === "read" ? args.chunkId : undefined,
          limit: args.action === "read" ? args.limit : undefined,
        })
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], structuredContent: result as unknown as Record<string, unknown> }
      }
      if (args.action === "refresh") {
        if (!args.sourceId) throw new Error("sourceId is required for sources action:refresh.")
        const result = await client.refreshSource(pid, args.sourceId)
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], structuredContent: result as unknown as Record<string, unknown> }
      }
      if (args.action === "promote") {
        if (!args.sourceId || !args.chunkId || !args.content) throw new Error("sourceId, chunkId, and content are required for sources action:promote.")
        const result = await client.promoteSourceCitation(pid, args.sourceId, args)
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], structuredContent: result as unknown as Record<string, unknown> }
      }
      if (args.action === "import") {
        const result = await client.importSourceCitations(pid, args)
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], structuredContent: result as unknown as Record<string, unknown> }
      }
      if (args.action === "delete") {
        if (!args.sourceId) throw new Error("sourceId is required for sources action:delete.")
        const result = await client.archiveSource(pid, args.sourceId)
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], structuredContent: result }
      }
      if (args.action === "purge") {
        if (!args.sourceId) throw new Error("sourceId is required for sources action:purge.")
        const result = await client.purgeSource(pid, args.sourceId)
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], structuredContent: result }
      }
      throw new Error("Unsupported sources action.")
    }
  )
}

const SESSION_GUIDELINES = `# Relay Session Guidelines

You have access to Relay, a project memory system that keeps context synchronized across coding sessions and AI tools.

## Recommended Workflow

### At Session Start
- Call \`get_brief\` first. Relay will try to resolve the correct project automatically.
- Only call \`list_projects\` and then \`set_current_project\` if \`get_brief\` reports project ambiguity or clearly resolves to the wrong project.
- If \`get_brief\` succeeds and the brief is coherent, stop there for a basic resume. Do not immediately follow it with \`recall\` just to restate the same continuity.

### During the Session
- Before making architectural, product, or process decisions, call \`recall\` when local context may be incomplete.
- When the user confirms a durable decision, constraint, task, or stable product truth, call \`save\` with action \`add_memory\` to persist that single fact.
- If recall/search returns no useful memory and you then investigate files, docs, tests, config, or history, save any confirmed durable findings you discover. Do not save the empty search attempt itself.
- If \`get_brief\` or \`recall\` shows stale, completed, contradicted, or superseded context, clean it up with \`save\` action \`manage_memory\` or correct project state with \`save\` action \`set_state\`. Prefer archiving obsolete memory over adding duplicate correction notes.
- Do not save speculative brainstorming, partial ideas, or every conversational turn.
- For coding work, save the facts a future agent needs to continue: files/modules touched, public API or schema changes, migrations, commands/tests run with outcomes, unresolved blockers, and exact small snippets only when the exact text matters.
- If Relay context looks stale or wrong, inspect it before mutating with \`recall\` filters, includes, memoryId, or tracePhrase.

### Source Retrieval
- Use \`sources\` first for project-governed docs and repository sources already indexed in Relay.
- Use \`sources\` action \`resolve\` to find evidence-backed project/global/package/URL candidates. If Relay cannot resolve a source and Context7 or Nia MCP tools are available in the client, call those external tools directly instead of asking Relay to fake an adapter.
- After using Context7, Nia, or another external docs tool, call \`sources\` action \`import\` only for citations that are useful to keep in this project. Imported citations are source evidence, not durable memory.
- Promote a source citation into Relay memory only when the user wants the fact to persist beyond the source itself. Refresh can later mark promoted memories potentially stale when their evidence changes.

### At Session End
- Use \`save\` action \`checkpoint\` only at meaningful boundaries: before compaction-equivalent actions, before switching tasks, or after finishing a logical milestone.
- Use \`save\` action \`save_session\` when wrapping a meaningful unit of work, not after every turn.
- This keeps Relay current without turning it into a noisy per-turn write path.

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

  // First-value funnel: record the first time a user reaches the MCP surface.
  // Idempotent via user_milestones.
  void fireUserMilestone(viewer.userId, "mcp_connected_first_time", {
    transport: "http",
  }).catch(() => {})

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
