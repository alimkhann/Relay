import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { RelayClient } from "../client.js"
import { listProjectsSchema, listProjects } from "./list-projects.js"
import { getBriefSchema, getBrief } from "./get-brief.js"
import { recallSchema, recall } from "./recall.js"
import { saveSchema, save } from "./save.js"
import { sourcesSchema, sources } from "./sources.js"
import { z } from "zod"
import type { RelayProjectResolutionResult } from "@relay/shared"

interface ToolRegistrationContext {
  client: RelayClient
  resolveProjectId: (explicitId?: string) => Promise<string>
  resolveProjectSelection?: (explicitId?: string) => Promise<RelayProjectResolutionResult>
  getCachedProjectId: () => string | null
  setCachedProjectId: (projectId: string) => void
}

/**
 * Registers Relay MCP tools on the given server.
 * Shared between local stdio and remote HTTP MCP servers.
 *
 * Keep this public surface intentionally small. Legacy split tools remain as
 * internal implementations behind recall/save, but are no longer advertised to
 * agents so the MCP prompt footprint stays low.
 */
export function registerTools(server: McpServer, ctx: ToolRegistrationContext) {
  const { client, resolveProjectId, resolveProjectSelection, getCachedProjectId, setCachedProjectId } = ctx
  const writeTools = new Set(["set_current_project", "save"])
  const originalTool = server.tool.bind(server)

  ;(server as McpServer & { tool: typeof server.tool }).tool = ((name: string, description: string, schema: unknown, maybeHintsOrHandler: unknown, maybeHandler?: unknown) => {
    const hasHints = typeof maybeHandler === "function"
    const hints = hasHints ? maybeHintsOrHandler : undefined
    const handler = (hasHints ? maybeHandler : maybeHintsOrHandler) as (args: Record<string, unknown>) => Promise<unknown>

    const wrapped = async (args: Record<string, unknown>) => {
      const initialProjectId =
        typeof args?.projectId === "string"
          ? args.projectId
          : getCachedProjectId()
      const initialResolutionSource =
        typeof args?.projectId === "string"
          ? "explicit"
          : getCachedProjectId()
            ? "cached"
            : null
      const readOrWrite =
        name === "sources" && ["index", "refresh", "promote", "import", "delete", "purge"].includes(String(args?.action ?? ""))
          ? "write"
          : writeTools.has(name) ? "write" : "read"

      client.captureAnalytics("mcp_tool_called", {
        tool_name: name,
        transport: "stdio",
        read_or_write: readOrWrite,
        project_id: initialProjectId ?? null,
        project_resolution_source: initialResolutionSource,
        agent_name: client.getAgentName(),
        client_name: client.getClientName(),
        success: true,
      })

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

        client.captureAnalytics("mcp_tool_completed", {
          tool_name: name,
          transport: "stdio",
          read_or_write: readOrWrite,
          project_id: resolvedProjectId ?? null,
          project_resolution_source: resolutionSource,
          agent_name: client.getAgentName(),
          client_name: client.getClientName(),
          success: true,
        })

        return result
      } catch (error) {
        client.captureAnalytics("mcp_tool_failed", {
          tool_name: name,
          transport: "stdio",
          read_or_write: readOrWrite,
          project_id: initialProjectId ?? null,
          project_resolution_source: initialResolutionSource,
          agent_name: client.getAgentName(),
          client_name: client.getClientName(),
          success: false,
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
    "list_projects",
    "List all Relay projects you have access to. Returns project IDs, names, slugs, routing keywords, and which project is currently active for this MCP session. Do not call this before the first get_brief unless Relay explicitly reports project ambiguity or resolves to the wrong project.",
    listProjectsSchema.shape,
    async () => listProjects(client, getCachedProjectId())
  )

  server.tool(
    "set_current_project",
    "Switch the current Relay project for this MCP session. Use this when the user is clearly working on a different project than the cached/auto-detected one. The switch persists for the lifetime of the MCP server process. Call list_projects first to find the correct projectId.",
    z.object({
      projectId: z.string().uuid().describe("The ID of the project to switch to."),
    }).shape,
    async (args) => {
      setCachedProjectId(args.projectId)
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
    "get_brief",
    `Fetch a project context brief from Relay. This is the default session-start tool.

- If projectId is omitted, Relay first tries the cached or configured project.
- If that is missing, Relay tries to resolve the project from the current workspace.
- Only call list_projects and set_current_project if get_brief reports ambiguity or the wrong project.
- If the brief contains stale, completed, contradicted, or superseded context, use recall to inspect it and save with action: "manage_memory" or "set_state" to clean it up.`,
    getBriefSchema.shape,
    async (args) => {
      if (resolveProjectSelection) {
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

        const result = await getBrief(client, args, resolution.projectId, resolution)
        return result
      }

      const projectId = await resolveProjectId(args.projectId)
      return getBrief(client, args, projectId)
    }
  )

  server.tool(
    "recall",
    `Unified read tool — replaces recall_context, search_context, get_project_state, list_memory, get_memory, list_sessions, list_recent_activity, trace_context_sources, and list_briefs.

- No params → project state overview
- query → hybrid search + project state (like recall_context)
- memoryId → single item detail
- include: ["sessions"] → list sessions
- include: ["activity"] → recent activity
- include: ["briefs"] → list briefs
- tracePhrase → trace provenance of a phrase
- filters → filter memory listing by type/tags/pinned/archived

If a query returns no useful memory, investigate locally and save only confirmed durable findings, not the empty recall attempt.
If returned context is stale, completed, contradicted, or superseded, clean it up with save action: "manage_memory" or correct project state with save action: "set_state".`,
    recallSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      const result = await recall(client, args, projectId)
      if (args.query) {
        await client.recordSessionEvent(projectId, "context_recalled", {
          query: args.query,
        }).catch(() => {})
      }
      return result
    }
  )

  server.tool(
    "sources",
    `Project-governed source lifecycle for Relay docs and repository sources. Actions:
- list: list indexed project sources
- resolve: resolve a technology, package, manifest, or URL to evidence-backed source candidates
- index: index a public docs/research URL
- status/read: inspect a source and its chunks
- search: explicitly search indexed sources with citations
- context_pack: return grouped source snippets under a token budget
- explore: list indexed pages/chunks for navigation
- grep: regex/keyword search indexed source text
- refresh: re-fetch and re-index a source (external URL or uploaded file)
- promote: save a selected citation into Relay memory
- import: save citations returned by external tools such as Context7 or Nia with provenance; Relay does not fake those adapters
- delete: archive a source (soft, recoverable; hides it from list)
- purge: permanently delete an archived source and its stored file`,
    sourcesSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return sources(client, args, projectId)
    }
  )

  server.tool(
    "save",
    `Unified write tool — replaces save_context, checkpoint_context, add_memory, manage_memory, set_project_state, update_project, archive_session, regenerate_brief, and delete_brief.

Actions: save_session, checkpoint, add_memory, manage_memory, set_state, update_project, archive_session, regenerate_brief, delete_brief.

Pass action-specific fields in payload. Examples:
- { action: "add_memory", payload: { type: "decision", content: "Use PostgreSQL", tags: ["db"] } }
- { action: "checkpoint", payload: { summary: "Auth implementation done" } }
- { action: "manage_memory", payload: { action: "archive", memoryId: "..." } }
- { action: "archive_session", payload: { sessionId: "...", archived: true } }

Use manage_memory whenever get_brief or recall shows stale, completed, contradicted, or superseded context. Prefer archiving old facts over adding corrections that leave obsolete memory active.`,
    saveSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      const recordMutation: Parameters<typeof save>[3] = async (pid, mutation) => {
        await client.recordSessionMutation(pid, mutation).catch(() => {})
      }
      const recordEvent: Parameters<typeof save>[4] = async (pid, eventType, payload) => {
        await client.recordSessionEvent(pid, eventType, payload).catch(() => undefined)
      }
      return save(client, args, projectId, recordMutation, recordEvent)
    }
  )
}
