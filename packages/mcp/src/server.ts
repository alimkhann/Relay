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
import { updateMemorySchema, updateMemory } from "./tools/update-memory.js"
import { deleteMemorySchema, deleteMemory } from "./tools/delete-memory.js"
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
    "List all Relay projects you have access to. Returns project IDs, names, and metadata.",
    listProjectsSchema.shape,
    async () => listProjects(client)
  )

  server.tool(
    "relay_get_brief",
    "Fetch a project context brief from Relay. Returns a markdown document with project state, decisions, constraints, and recent activity — ideal for starting or continuing a coding session.",
    getBriefSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return getBrief(client, args, projectId)
    }
  )

  server.tool(
    "relay_get_project_state",
    "Get full structured project state including overview, objectives, decisions, constraints, tasks, and all memory items grouped by type.",
    getProjectStateSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return getProjectState(client, projectId)
    }
  )

  server.tool(
    "relay_search_context",
    "Search memory items and project context by keyword. Useful for finding specific decisions, constraints, or notes.",
    searchContextSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return searchContext(client, args, projectId)
    }
  )

  server.tool(
    "relay_add_memory",
    "Add a single memory item to the project. Use for recording decisions, constraints, tasks, notes, or other structured knowledge during a coding session.",
    addMemorySchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return addMemory(client, args, projectId)
    }
  )

  server.tool(
    "relay_save_context",
    "Save a structured coding session summary to Relay. Creates multiple memory items from a session summary, decisions, progress, next steps, constraints, and notes. Call this before ending a coding session.",
    saveContextSchema.shape,
    async (args) => {
      const projectId = await resolveProjectId(args.projectId)
      return saveContext(client, args, projectId)
    }
  )

  server.tool(
    "relay_update_memory",
    "Update an existing memory item. Use this to correct outdated decisions, refine constraints, or update task status. Helps keep context clean and accurate.",
    updateMemorySchema.shape,
    async (args) => updateMemory(client, args)
  )

  server.tool(
    "relay_delete_memory",
    "Delete one or more memory items by ID. Use this to remove contradicted decisions, resolved tasks, outdated constraints, or duplicate entries. Keeps project context lean and relevant for brief generation.",
    deleteMemorySchema.shape,
    async (args) => deleteMemory(client, args)
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
