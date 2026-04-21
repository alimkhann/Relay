import { z } from "zod"
import type { RelayClient } from "../client.js"

export const listProjectsSchema = z.object({})

interface ProjectSummary {
  id: string
  name: string
  slug: string
  description: string | null
  memoryCount: number
  sessionCount: number
  routingContext: { hasMeaningfulContext: boolean; keywords: string[] } | null
  updatedAt: string
}

interface ListProjectsResponse {
  projects: ProjectSummary[]
}

export async function listProjects(client: RelayClient, currentProjectId: string | null = null) {
  const data = await client.get<ListProjectsResponse>("/api/projects")

  const projects = data.projects.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    memoryCount: p.memoryCount,
    sessionCount: p.sessionCount,
    keywords: p.routingContext?.keywords ?? [],
    isCurrent: currentProjectId === p.id,
  }))

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(projects, null, 2)
      }
    ]
  }
}
