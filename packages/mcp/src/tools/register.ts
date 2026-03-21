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

interface ToolRegistrationContext {
  client: RelayClient
  resolveProjectId: (explicitId?: string) => Promise<string>
  getCachedProjectId: () => string | null
}

/**
 * Registers all Relay MCP tools on the given server.
 * Shared between local stdio and remote HTTP MCP servers.
 */
export function registerTools(server: McpServer, ctx: ToolRegistrationContext) {
  const { client, resolveProjectId, getCachedProjectId } = ctx

  server.tool(
    "list_projects",
    "List all Relay projects you have access to. Returns project IDs, names, and metadata. Call this first if you need to find a project ID.",
    listProjectsSchema.shape,
    async () => listProjects(client)
  )

  server.tool(
    "get_brief",
    "Fetch a project context brief from Relay. Returns a markdown document with project state, decisions, constraints, tasks, and key notes. Call this at the start of every coding session to restore project memory.",
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
}
