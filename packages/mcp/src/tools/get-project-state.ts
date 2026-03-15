import { z } from "zod"
import type { RelayClient } from "../client.js"

export const getProjectStateSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided.")
})

interface DashboardResponse {
  project: { id: string; name: string; slug: string; description: string | null }
  dashboard: {
    projectState: Record<string, unknown> | null
    derivedProjectState: Record<string, unknown> | null
    stateOverrides: Record<string, unknown> | null
    stateStatus: Record<string, unknown>
    memory: Array<{
      id: string
      type: string
      title: string | null
      content: string
      pinned: boolean
      updatedAt: string
    }>
  }
}

export async function getProjectState(
  client: RelayClient,
  resolvedProjectId: string
) {
  const data = await client.get<DashboardResponse>(`/api/projects/${resolvedProjectId}`)

  const state = data.dashboard.derivedProjectState ?? data.dashboard.projectState

  // Group memory by type
  const memoryByType: Record<string, Array<{ id: string; title: string | null; content: string; pinned: boolean }>> = {}
  for (const item of data.dashboard.memory) {
    const group = memoryByType[item.type] ?? []
    group.push({ id: item.id, title: item.title, content: item.content, pinned: item.pinned })
    memoryByType[item.type] = group
  }

  const result = {
    project: {
      id: data.project.id,
      name: data.project.name,
      slug: data.project.slug,
      description: data.project.description
    },
    projectState: state,
    stateOverrides: data.dashboard.stateOverrides,
    stateStatus: data.dashboard.stateStatus,
    memory: memoryByType
  }

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }]
  }
}
