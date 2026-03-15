import { z } from "zod"
import type { RelayClient } from "../client.js"

export const searchContextSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  query: z.string().describe("Search query to match against memory items"),
  types: z
    .array(z.enum(["note", "decision", "constraint", "requirement", "task", "artifact"]))
    .optional()
    .describe("Filter by memory item types")
})

interface MemoryItem {
  id: string
  type: string
  title: string | null
  content: string
  pinned: boolean
  updatedAt: string
}

interface MemoryResponse {
  memory: MemoryItem[]
}

export async function searchContext(
  client: RelayClient,
  args: z.infer<typeof searchContextSchema>,
  resolvedProjectId: string
) {
  const data = await client.get<MemoryResponse>(`/api/projects/${resolvedProjectId}/memory`)

  const queryLower = args.query.toLowerCase()
  const typeFilter = args.types ? new Set(args.types) : null

  const matches = data.memory.filter((item) => {
    if (typeFilter && !typeFilter.has(item.type as "note")) {
      return false
    }
    const titleMatch = item.title?.toLowerCase().includes(queryLower) ?? false
    const contentMatch = item.content.toLowerCase().includes(queryLower)
    return titleMatch || contentMatch
  })

  return {
    content: [
      {
        type: "text" as const,
        text: matches.length > 0
          ? JSON.stringify(matches, null, 2)
          : `No memory items found matching "${args.query}".`
      }
    ]
  }
}
