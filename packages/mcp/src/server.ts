import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { resolveRelayProjectSelection, type RelayProjectResolutionResult } from "@relay/shared"
import type { RelayClient } from "./client.js"
import type { RelayConfig } from "./config.js"
import { detectProjectSelection } from "./utils/project-detection.js"
import { registerTools } from "./tools/register.js"
import { resolvePersonalProjectId } from "./tools/resolve-personal.js"
import { readProjectBrief } from "./resources/project-brief.js"
import { SESSION_GUIDELINES } from "./prompts/session-guidelines.js"

interface ProjectSummary {
  id: string
  name: string
  slug?: string | null
  routingContext: { keywords: string[] } | null
  kind?: "project" | "personal"
}

interface ListProjectsResponse {
  projects: ProjectSummary[]
}

export function createServer(client: RelayClient, config: RelayConfig): McpServer {
  const server = new McpServer({
    name: "relay",
    version: "0.4.1"
  })

  // Cache for resolved project ID
  let cachedProjectId: string | null = config.projectId ?? null
  let projectDetectionAttemptedAt = 0
  let lastDetectionCwd: string | null = null
  let explicitSwitch = false
  const PROJECT_DETECTION_CACHE_MS = 5 * 60 * 1000

  async function listProjectsForResolution() {
    const data = await client.get<ListProjectsResponse>("/api/projects")
    return data.projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug ?? null,
      keywords: p.routingContext?.keywords ?? [],
      kind: p.kind ?? "project",
    }))
  }

  // Resolve the literal "personal" alias to the user's kind='personal' project.
  // See resolvePersonalProjectId (extracted + exported for testing).

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

    // If the working directory changed between tool calls, invalidate the
    // cache so we re-detect for the new project — unless the user has
    // explicitly switched via set_current_project.
    const currentCwd = process.cwd()
    if (!explicitSwitch && lastDetectionCwd !== null && lastDetectionCwd !== currentCwd) {
      cachedProjectId = null
      projectDetectionAttemptedAt = 0
    }

    if (cachedProjectId) {
      return {
        status: "resolved",
        projectId: cachedProjectId,
        source: "cached",
        confidence: explicitSwitch ? 1 : 0.99,
        needsUserIntervention: false,
      }
    }

    if (Date.now() - projectDetectionAttemptedAt > PROJECT_DETECTION_CACHE_MS) {
      projectDetectionAttemptedAt = Date.now()
      lastDetectionCwd = currentCwd
      try {
        const candidates = await listProjectsForResolution()
        const detected = await detectProjectSelection(candidates)
        if (detected.status === "resolved") {
          cachedProjectId = detected.projectId
          return detected
        }
        return detected
      } catch {
        // Detection failed, will require explicit projectId
      }
    }

    const projects = await listProjectsForResolution().catch(() => [])
    return resolveRelayProjectSelection({
      cachedProjectId,
      projects,
    })
  }

  async function resolveProjectId(explicitId?: string): Promise<string> {
    // "personal" alias → the user's kind='personal' project id.
    if (explicitId === "personal") {
      return resolvePersonalProjectId(client)
    }
    const result = await resolveProjectSelection(explicitId)
    if (result.status === "resolved") return result.projectId
    throw new Error(
      "Relay could not confidently determine the active project. Call list_projects to inspect candidates, then set_current_project with the correct projectId."
    )
  }

  // --- Tools ---
  registerTools(server, {
    client,
    resolveProjectId,
    resolveProjectSelection,
    getCachedProjectId: () => cachedProjectId,
    setCachedProjectId: (projectId: string) => {
      cachedProjectId = projectId
      explicitSwitch = true
      lastDetectionCwd = process.cwd()
      projectDetectionAttemptedAt = Date.now()
    },
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
