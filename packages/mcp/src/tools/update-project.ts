import { z } from "zod"
import type { RelayClient } from "../client.js"

export const updateProjectSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  name: z.string().optional().describe("Updated project name"),
  description: z.string().optional().describe("Updated project description")
})

interface ProjectResponse {
  project: {
    id: string
    name: string
    description: string | null
  }
}

export async function updateProject(
  client: RelayClient,
  args: z.infer<typeof updateProjectSchema>,
  resolvedProjectId: string
) {
  const { projectId: _, ...updates } = args

  const data = await client.patch<ProjectResponse>(
    `/api/projects/${resolvedProjectId}`,
    updates
  )

  return {
    content: [
      {
        type: "text" as const,
        text: `Project updated: "${data.project.name}" (id: ${data.project.id})`
      }
    ]
  }
}
