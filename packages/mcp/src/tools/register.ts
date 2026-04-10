import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { RelayClient } from "../client.js"
import { listProjectsSchema, listProjects } from "./list-projects.js"
import { getBriefSchema, getBrief } from "./get-brief.js"
import { getProjectStateSchema, getProjectState } from "./get-project-state.js"
import { searchContextSchema, searchContext } from "./search-context.js"
import { addMemorySchema, addMemory } from "./add-memory.js"
import { saveContextSchema, saveContext } from "./save-context.js"
import { manageMemorySchema, manageMemory } from "./manage-memory.js"
import { updateProjectSchema, updateProject } from "./update-project.js"
import { recallContextSchema, recallContext } from "./recall-context.js"
import { z } from "zod"

interface ToolRegistrationContext {
  client: RelayClient
  resolveProjectId: (explicitId?: string) => Promise<string>
  getCachedProjectId: () => string | null
  setCachedProjectId: (projectId: string) => void
}

/**
 * Registers all Relay MCP tools on the given server.
 * Shared between local stdio and remote HTTP MCP servers.
 */
export function registerTools(server: McpServer, ctx: ToolRegistrationContext) {
  const { client, resolveProjectId, getCachedProjectId, setCachedProjectId } = ctx

  server.tool(
    "list_projects",
    "List all Relay projects you have access to. Returns project IDs, names, slugs, and routing keywords. Call this first to find a project ID and to match the current working directory against project names/slugs/keywords before calling get_brief.",
    listProjectsSchema.shape,
    async () => listProjects(client)
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
    `Fetch a project context brief from Relay. Returns a markdown document with project state, decisions, constraints, tasks, and key notes.

IMPORTANT — before calling get_brief, always verify which project the user is working on:
1. Call list_projects to see all available projects.
2. Match the current working directory / git repository against the project names, slugs, and routing keywords.
3. If the auto-detected or cached project is wrong, call set_current_project with the correct projectId.
4. Only then call get_brief.

Call this at the start of every coding session to restore project memory.`,
    getBriefSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      const syncSurface = args.syncSurface ?? client.getDefaultSyncSurface()
      const since = args.kind === "quick_continuity"
        ? await client.getDefaultSince(projectId, args.since)
        : args.since
      const result = await getBrief(client, { ...args, since, syncSurface }, projectId)
      await client.recordSessionEvent(projectId, "brief_read", {
        kind: args.kind,
        targetProfileKey: args.targetProfileKey,
        since: since ?? null,
        syncSurface,
      }).catch(() => {})
      return result
    }
  )

  server.tool(
    "get_project_state",
    "Get full structured project state including overview, objectives, decisions, constraints, tasks, and all memory items grouped by type. Use for debugging or when you need raw structured data.",
    getProjectStateSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      await client.recordSessionEvent(projectId, "project_state_read", {}).catch(() => {})
      return getProjectState(client, projectId)
    }
  )

  server.tool(
    "search_context",
    "Search memory items and project context by keyword. Supports stemming (e.g., 'auth' matches 'authentication') and tag filtering. Use to check if a decision or constraint already exists before adding duplicates.",
    searchContextSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      const result = await searchContext(client, args, projectId)
      await client.recordSessionEvent(projectId, "context_search", {
        query: args.query,
        types: args.types ?? [],
        tags: args.tags ?? [],
      }).catch(() => {})
      return result
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
    "Save a structured coding session summary to Relay. Creates multiple memory items atomically from a session summary, decisions, progress, next steps, constraints, and notes. Call this before ending a session to preserve context for the next agent.",
    saveContextSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      const result = await saveContext(client, args, projectId)
      await client.recordSessionMutation(projectId, {
        eventType: "session_context_saved",
        eventPayload: {
          savedVia: "relay_save_context",
        },
        summary: args.summary,
        progress: args.progress,
        decisions: args.decisions,
        constraints: args.constraints,
        nextSteps: args.nextSteps,
        notes: args.notes,
      }).catch(() => {})
      await client.closeWorkSession().catch(() => {})
      return result
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
