import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { RelayClient } from "../client.js"
import { listProjectsSchema, listProjects } from "./list-projects.js"
import { getBriefSchema, getBrief } from "./get-brief.js"
import { getProjectStateSchema, getProjectState } from "./get-project-state.js"
import { listMemorySchema, listMemory } from "./list-memory.js"
import { getMemorySchema, getMemory } from "./get-memory.js"
import { searchContextSchema, searchContext } from "./search-context.js"
import { addMemorySchema, addMemory } from "./add-memory.js"
import { saveContextSchema, saveContext } from "./save-context.js"
import { manageMemorySchema, manageMemory } from "./manage-memory.js"
import { updateProjectSchema, updateProject } from "./update-project.js"
import { recallContextSchema, recallContext } from "./recall-context.js"
import { setProjectStateSchema, setProjectState } from "./set-project-state.js"
import { listSessionsSchema, listSessions } from "./list-sessions.js"
import { archiveSessionSchema, archiveSession } from "./archive-session.js"
import { listBriefsSchema, listBriefs } from "./list-briefs.js"
import { regenerateBriefSchema, regenerateBrief } from "./regenerate-brief.js"
import { deleteBriefSchema, deleteBrief } from "./delete-brief.js"
import { traceContextSourcesSchema, traceContextSources } from "./trace-context-sources.js"
import { listRecentActivitySchema, listRecentActivity } from "./list-recent-activity.js"
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
 * Registers all Relay MCP tools on the given server.
 * Shared between local stdio and remote HTTP MCP servers.
 */
export function registerTools(server: McpServer, ctx: ToolRegistrationContext) {
  const { client, resolveProjectId, resolveProjectSelection, getCachedProjectId, setCachedProjectId } = ctx
  const writeTools = new Set([
    "set_current_project",
    "archive_session",
    "regenerate_brief",
    "delete_brief",
    "add_memory",
    "save_context",
    "checkpoint_context",
    "manage_memory",
    "set_project_state",
    "update_project",
  ])
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
      const readOrWrite = writeTools.has(name) ? "write" : "read"

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
- Only call list_projects and set_current_project if get_brief reports ambiguity or the wrong project.`,
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
    "get_project_state",
    "Get full structured project state including overview, objectives, decisions, constraints, tasks, and all memory items grouped by type. Use this only when the brief is stale, contradictory, or you specifically need raw structured data for debugging.",
    getProjectStateSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return getProjectState(client, projectId)
    }
  )

  server.tool(
    "list_memory",
    "List project memory items with filters for type, archive state, pinned status, or tag. Use this when the user asks what Relay currently knows, or before choosing a memory item to update or archive.",
    listMemorySchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return listMemory(client, args, projectId)
    }
  )

  server.tool(
    "get_memory",
    "Get one memory item by ID, including provenance, conflict status, and relation metadata. Use after list_memory or search_context when you need to inspect an item before mutating it.",
    getMemorySchema.shape,
    async (args) => getMemory(client, args)
  )

  server.tool(
    "search_context",
    "Search memory items and project context by keyword. Supports stemming (e.g., 'auth' matches 'authentication') and tag filtering. Use this before high-impact decisions or when local context is incomplete, not as a default follow-up to a coherent get_brief result.",
    searchContextSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return searchContext(client, args, projectId)
    }
  )

  server.tool(
    "list_sessions",
    "List captured source sessions and Relay work sessions that currently influence continuity. Use this when the user explicitly asks what Relay captured, or when debugging stale or contradictory continuity. Do not call this for a normal resume when get_brief is coherent.",
    listSessionsSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return listSessions(client, args, projectId)
    }
  )

  server.tool(
    "archive_session",
    "Archive or restore a captured source session. Use this to detach stale or polluted captures from the continuity pipeline.",
    archiveSessionSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return archiveSession(client, args, projectId)
    }
  )

  server.tool(
    "list_briefs",
    "List generated Relay brief packets for the current project, including profile, kind, created time, and edited status. Use this for debugging stale or contradictory continuity, not for a normal resume when get_brief succeeded.",
    listBriefsSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return listBriefs(client, args, projectId)
    }
  )

  server.tool(
    "regenerate_brief",
    "Regenerate a project brief packet explicitly. Use this after cleanup or when the user wants a fresh brief instead of reusing cached continuity.",
    regenerateBriefSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return regenerateBrief(client, args, projectId)
    }
  )

  server.tool(
    "delete_brief",
    "Delete a specific brief packet by ID. Use this to remove stale or polluted generated briefs before regenerating.",
    deleteBriefSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return deleteBrief(client, args, projectId)
    }
  )

  server.tool(
    "trace_context_sources",
    "Trace why a phrase or project-state field appears in Relay context. Returns likely contributing memory items, digests, canon entries, sessions, summary snapshots, and briefs.",
    traceContextSourcesSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return traceContextSources(client, args, projectId)
    }
  )

  server.tool(
    "list_recent_activity",
    "List recent continuity activity such as captures, digests, memory mutations, work-session events, and brief generation. Use this to answer what changed recently.",
    listRecentActivitySchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return listRecentActivity(client, args, projectId)
    }
  )

  server.tool(
    "add_memory",
    "Add a single memory item to the project. Use for recording decisions, constraints, tasks, notes, or other structured knowledge during a coding session. Tag items with relevant keywords for easier search.",
    addMemorySchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      const result = await addMemory(client, args, projectId)
      await client.recordSessionMutation(projectId, {
        eventType: "memory_added",
        eventPayload: {
          type: args.type,
          title: args.title ?? null,
        },
        decisions: args.type === "decision" ? [args.content] : undefined,
        constraints: args.type === "constraint" ? [args.content] : undefined,
        nextSteps: args.type === "task" ? [args.content] : undefined,
        notes: args.type === "note" || args.type === "artifact" || args.type === "requirement" ? [args.content] : undefined,
      }).catch(() => {})
      return result
    }
  )

  server.tool(
    "save_context",
    `Push a structured session snapshot (summary, decisions, progress, constraints, next steps, notes) into Relay's active work session and run it through the digest + reconcile pipeline.

You DO NOT need to call this at natural break points — Relay auto-flushes on supported client hooks, on stdio shutdown, and opportunistically on the server before MCP requests. Call it explicitly only when the agent or user wants an immediate checkpoint (e.g. "save this decision now"), when wrapping a meaningful unit of work, or when ending a session from a client without hooks.

Set finalize=false to record state without closing the session — useful for mid-session snapshots. Default finalize=true flushes and closes.`,
    saveContextSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return saveContext(client, args, projectId)
    }
  )

  server.tool(
    "checkpoint_context",
    "Mid-session snapshot: identical payload to save_context but never closes the work session. Use when you want the current decisions/progress persisted in the work session without triggering a full flush. Relay will flush automatically at the next hook/shutdown/sweep.",
    saveContextSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return saveContext(client, { ...args, finalize: false }, projectId)
    }
  )

  server.tool(
    "manage_memory",
    "Update, delete, or archive memory items. Supports bulk operations for cleaning up outdated or contradicting items. Use to keep project context lean and accurate.",
    manageMemorySchema.shape,
    async (args) => {
      const result = await manageMemory(client, args)
      const cachedProjectId = getCachedProjectId()
      if (cachedProjectId) {
        await client.recordSessionEvent(cachedProjectId, "memory_managed", {
          action: args.action,
          memoryId: args.memoryId,
        }).catch(() => undefined)
      }
      return result
    }
  )

  server.tool(
    "set_project_state",
    "Upsert the high-level project state used for briefs and dashboard overview. Use this when bootstrapping or correcting canonical project context from an agent session. Omitted scalar fields stay unchanged; list fields merge uniquely unless replaceLists is true.",
    setProjectStateSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      const result = await setProjectState(client, args, projectId)
      await client.recordSessionMutation(projectId, {
        eventType: "project_state_updated",
        eventPayload: {
          replaceLists: args.replaceLists ?? false,
        },
        summary: args.projectOverview,
        currentObjective: args.currentObjective,
        progress: args.recentProgress,
        decisions: args.decisions,
        constraints: args.constraints,
        nextSteps: args.openTasks,
        relevantTools: args.relevantTools,
      }).catch(() => {})
      return result
    }
  )

  server.tool(
    "update_project",
    "Update a project's name or description. Use this to fix outdated project metadata.",
    updateProjectSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      const result = await updateProject(client, args, projectId)
      await client.recordSessionMutation(projectId, {
        eventType: "project_updated",
        eventPayload: {
          name: args.name ?? null,
          descriptionChanged: typeof args.description === "string",
        },
        summary: args.description ?? undefined,
      }).catch(() => {})
      return result
    }
  )

  server.tool(
    "recall_context",
    "Search memory and retrieve project state in one call. Use before making decisions to check for existing constraints, decisions, or prior context. Combines search_context results with a project state snapshot.",
    recallContextSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      const result = await recallContext(client, args, projectId)
      await client.recordSessionEvent(projectId, "context_recalled", {
        query: args.query,
      }).catch(() => {})
      return result
    }
  )
}
