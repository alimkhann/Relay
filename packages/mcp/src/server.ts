import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { RelayClient } from "./client.js"
import type { RelayConfig } from "./config.js"
import { detectProjectId } from "./utils/project-detection.js"
import { listProjectsSchema, listProjects } from "./tools/list-projects.js"
import { getBriefSchema, getBrief } from "./tools/get-brief.js"
import { getProjectStateSchema, getProjectState } from "./tools/get-project-state.js"
import { searchContextSchema, searchContext } from "./tools/search-context.js"
import { addMemorySchema, addMemory } from "./tools/add-memory.js"
import { saveContextSchema, saveContext } from "./tools/save-context.js"
import { manageMemorySchema, manageMemory } from "./tools/manage-memory.js"
import { updateProjectSchema, updateProject } from "./tools/update-project.js"
import { readProjectBrief } from "./resources/project-brief.js"

interface ProjectSummary {
  id: string
  name: string
  routingContext: { keywords: string[] } | null
}

interface ListProjectsResponse {
  projects: ProjectSummary[]
}

export function createServer(client: RelayClient, config: RelayConfig): McpServer {
  const server = new McpServer({
    name: "relay",
    version: "0.1.0"
  })

  // Cache for resolved project ID
  let cachedProjectId: string | null = config.projectId ?? null
  let projectDetectionAttempted = false

  async function resolveProjectId(explicitId?: string): Promise<string> {
    if (explicitId) return explicitId
    if (cachedProjectId) return cachedProjectId

    if (!projectDetectionAttempted) {
      projectDetectionAttempted = true
      try {
        const data = await client.get<ListProjectsResponse>("/api/projects")
        const candidates = data.projects.map((p) => ({
          id: p.id,
          name: p.name,
          keywords: p.routingContext?.keywords ?? []
        }))
        const detected = await detectProjectId(candidates)
        if (detected) {
          cachedProjectId = detected
          return detected
        }
      } catch {
        // Detection failed, will require explicit projectId
      }
    }

    throw new Error(
      "Could not determine project. Provide a projectId argument, set RELAY_PROJECT_ID env var, or call relay_list_projects to find your project ID."
    )
  }

  // --- Tools ---

  server.tool(
    "relay_list_projects",
    "List all Relay projects you have access to. Returns project IDs, names, and metadata. Call this first if you need to find a project ID.",
    listProjectsSchema.shape,
    async () => listProjects(client)
  )

  server.tool(
    "relay_get_brief",
    "Fetch a project context brief from Relay. Returns a markdown document with project state, decisions, constraints, tasks, and key notes. Call this at the start of every coding session to restore project memory.",
    getBriefSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return getBrief(client, args, projectId)
    }
  )

  server.tool(
    "relay_get_project_state",
    "Get full structured project state including overview, objectives, decisions, constraints, tasks, and all memory items grouped by type. Use for debugging or when you need raw structured data.",
    getProjectStateSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return getProjectState(client, projectId)
    }
  )

  server.tool(
    "relay_search_context",
    "Search memory items and project context by keyword. Supports stemming (e.g., 'auth' matches 'authentication') and tag filtering. Use to check if a decision or constraint already exists before adding duplicates.",
    searchContextSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return searchContext(client, args, projectId)
    }
  )

  server.tool(
    "relay_add_memory",
    "Add a single memory item to the project. Use for recording decisions, constraints, tasks, notes, or other structured knowledge during a coding session. Tag items with relevant keywords for easier search.",
    addMemorySchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return addMemory(client, args, projectId)
    }
  )

  server.tool(
    "relay_save_context",
    "Save a structured coding session summary to Relay. Creates multiple memory items atomically from a session summary, decisions, progress, next steps, constraints, and notes. Call this before ending a session to preserve context for the next agent.",
    saveContextSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return saveContext(client, args, projectId)
    }
  )

  server.tool(
    "relay_manage_memory",
    "Update, delete, or archive memory items. Supports bulk operations for cleaning up outdated or contradicting items. Use to keep project context lean and accurate.",
    manageMemorySchema.shape,
    async (args) => manageMemory(client, args)
  )

  server.tool(
    "relay_update_project",
    "Update a project's name or description. Use this to fix outdated project metadata.",
    updateProjectSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return updateProject(client, args, projectId)
    }
  )

  // --- Resources ---

  server.resource(
    "project-brief",
    new ResourceTemplate("relay://project/{projectId}/brief", {
      list: async () => {
        try {
          const data = await client.get<ListProjectsResponse>("/api/projects")
          return {
            resources: data.projects.map((p) => ({
              uri: `relay://project/${p.id}/brief`,
              name: `${p.name} — Project Brief`,
              mimeType: "text/markdown"
            }))
          }
        } catch {
          return { resources: [] }
        }
      }
    }),
    {
      title: "Relay Project Brief",
      description: "Current project context brief with state, decisions, and recent activity",
      mimeType: "text/markdown"
    },
    async (uri, { projectId }) => readProjectBrief(client, projectId as string)
  )

  return server
}
