import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { RelayClient } from "./client.js"
import type { RelayConfig } from "./config.js"
import { detectProjectId } from "./utils/project-detection.js"
import { registerTools } from "./tools/register.js"
import { readProjectBrief } from "./resources/project-brief.js"
import { SESSION_GUIDELINES } from "./prompts/session-guidelines.js"

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
  let projectDetectionAttemptedAt = 0
  const PROJECT_DETECTION_CACHE_MS = 5 * 60 * 1000

  async function resolveProjectId(explicitId?: string): Promise<string> {
    if (explicitId) return explicitId
    if (cachedProjectId) return cachedProjectId

    if (Date.now() - projectDetectionAttemptedAt > PROJECT_DETECTION_CACHE_MS) {
      projectDetectionAttemptedAt = Date.now()
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
      "Could not determine project. Provide a projectId argument, set RELAY_PROJECT_ID env var, or call list_projects to find your project ID."
    )
  }

  // --- Tools ---
  registerTools(server, {
    client,
    resolveProjectId,
    getCachedProjectId: () => cachedProjectId,
  })

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

  // --- Prompts ---

  server.prompt(
    "relay_session_guidelines",
    "Best practices for using Relay tools during a coding session — when to read briefs, save context, and record decisions.",
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: SESSION_GUIDELINES
          }
        }
      ]
    })
  )

  return server
}
