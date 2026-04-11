import { z } from "zod"

import type { RelayClient } from "../client.js"

export const setProjectStateSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  projectOverview: z.string().optional().describe("High-level description of what the project is."),
  currentObjective: z.string().optional().describe("Current goal or focus area for the project."),
  recentProgress: z.string().optional().describe("Recent progress worth carrying forward."),
  stackDomain: z.string().optional().describe("Short stack or domain summary."),
  decisions: z.array(z.string()).optional().describe("Durable project decisions to merge into state."),
  constraints: z.array(z.string()).optional().describe("Constraints to merge into project state."),
  openTasks: z.array(z.string()).optional().describe("Open tasks to merge into project state."),
  relevantTools: z.array(z.string()).optional().describe("Relevant tools, platforms, or surfaces to merge into state."),
  replaceLists: z.boolean().optional().describe("Replace list fields instead of merging them uniquely."),
})

type ProjectStateResponse = {
  state: {
    projectOverview: string | null
    currentObjective: string | null
    recentProgress: string | null
    stackDomain: string | null
    decisions: string[]
    constraints: string[]
    openTasks: string[]
    relevantTools: string[]
  }
}

export async function setProjectState(
  client: RelayClient,
  args: z.infer<typeof setProjectStateSchema>,
  resolvedProjectId: string,
) {
  const data = await client.post<ProjectStateResponse>(`/api/projects/${resolvedProjectId}/mcp-state`, args)

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  }
}
