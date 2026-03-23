import { z } from "zod"
import type { RelayClient } from "../client.js"

export const recallContextSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  query: z.string().describe("What to search for — e.g., 'authentication approach', 'database choice', 'rate limiting'.")
})

interface SearchResponse {
  results: Array<{
    id: string
    type: string
    title: string | null
    content: string
    pinned: boolean
    updatedAt: string
    rank: number
    tags?: string[]
  }>
}

interface DashboardResponse {
  dashboard: {
    projectState: {
      projectOverview: string | null
      currentObjective: string | null
      recentProgress: string | null
      decisions: string[]
      constraints: string[]
      openTasks: string[]
    } | null
  }
}

export async function recallContext(
  client: RelayClient,
  args: z.infer<typeof recallContextSchema>,
  resolvedProjectId: string
) {
  const sections: string[] = []

  // 1. Search memory items
  const params = new URLSearchParams({ q: args.query })
  let searchResults: SearchResponse["results"] = []
  try {
    const data = await client.get<SearchResponse>(
      `/api/projects/${resolvedProjectId}/memory/search?${params.toString()}`
    )
    searchResults = data.results
  } catch {
    // Search failed, continue with state only
  }

  // 2. Fetch project state snippet
  try {
    const data = await client.get<DashboardResponse>(`/api/projects/${resolvedProjectId}`)
    const state = data.dashboard.projectState
    if (state) {
      const stateParts: string[] = ["## Project Context"]
      if (state.projectOverview) stateParts.push(`**Overview:** ${state.projectOverview}`)
      if (state.currentObjective) stateParts.push(`**Current Objective:** ${state.currentObjective}`)
      if (state.recentProgress) stateParts.push(`**Recent Progress:** ${state.recentProgress}`)
      sections.push(stateParts.join("\n"))
    }
  } catch {
    // State fetch failed, continue with search results only
  }

  // 3. Format search results
  if (searchResults.length > 0) {
    sections.push(`## Matching Memory Items (${searchResults.length})`)
    for (const item of searchResults.slice(0, 15)) {
      const label = `[${item.type}]${item.pinned ? " (pinned)" : ""}`
      const title = item.title ? ` ${item.title}:` : ""
      sections.push(`- ${label}${title} ${item.content}`)
    }
  } else {
    sections.push(`No memory items found matching "${args.query}".`)
  }

  return {
    content: [
      {
        type: "text" as const,
        text: sections.join("\n\n")
      }
    ]
  }
}
