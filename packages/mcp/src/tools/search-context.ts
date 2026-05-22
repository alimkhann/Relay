import { z } from "zod"
import type { RelayClient } from "../client.js"

export const searchContextSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  spaceId: z.string().optional().describe("Space ID (personal or project). Scopes the search to that space."),
  query: z.string().describe("Search query to match against memory items. Supports stemming (e.g., 'auth' matches 'authentication')."),
  types: z
    .array(z.enum(["note", "decision", "constraint", "requirement", "task", "artifact"]))
    .optional()
    .describe("Filter by memory item types"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Filter by tags"),
  lifecycleStates: z.array(z.enum(["active", "cooling", "archived"])).optional(),
  includeArchived: z.boolean().optional(),
})

interface MemoryItem {
  id: string
  type: string
  title: string | null
  content: string
  pinned: boolean
  updatedAt: string
  tags?: string[]
}

interface SearchResponse {
  results: Array<MemoryItem & { rank: number }>
}

interface MemoryResponse {
  memory: MemoryItem[]
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter((t) => t.length > 1)
}

function scoreItem(item: MemoryItem, tokens: string[]): number {
  if (tokens.length === 0) return 0

  const titleLower = (item.title ?? "").toLowerCase()
  const contentLower = item.content.toLowerCase()
  let matched = 0

  for (const token of tokens) {
    if (titleLower.includes(token) || contentLower.includes(token)) {
      matched++
    }
  }

  if (matched === 0) return 0

  let score = matched / tokens.length
  const titleMatches = tokens.filter((t) => titleLower.includes(t)).length
  if (titleMatches > 0) score += 0.2 * (titleMatches / tokens.length)
  if (item.pinned) score += 0.1

  return score
}

export async function searchContext(
  client: RelayClient,
  args: z.infer<typeof searchContextSchema>,
  resolvedProjectId: string
) {
  // Try server-side full-text search first
  try {
    const params = new URLSearchParams({ q: args.query })
    if (args.types?.length) params.set("types", args.types.join(","))
    if (args.tags?.length) params.set("tags", args.tags.join(","))
    if (args.lifecycleStates?.length) params.set("lifecycle", args.lifecycleStates.join(","))
    if (args.includeArchived) params.set("includeArchived", "true")

    const endpoint = args.spaceId
      ? `/api/spaces/${args.spaceId}/memory/search?${params.toString()}`
      : `/api/projects/${resolvedProjectId}/memory/search?${params.toString()}`
    const data = await client.get<SearchResponse>(endpoint)

    return {
      content: [
        {
          type: "text" as const,
          text: data.results.length > 0
            ? JSON.stringify(data.results, null, 2)
            : `No memory items found matching "${args.query}".`
        }
      ]
    }
  } catch {
    // Fall back to client-side search
  }

  // The client-side fallback only knows the project endpoint; for space-scoped
  // search just report no results rather than leaking project items.
  if (args.spaceId) {
    return {
      content: [{ type: "text" as const, text: `No memory items found matching "${args.query}".` }],
    }
  }

  const data = await client.get<MemoryResponse>(`/api/projects/${resolvedProjectId}/memory`)

  const tokens = tokenize(args.query)
  const typeFilter = args.types ? new Set(args.types) : null

  const scored = data.memory
    .filter((item) => !typeFilter || typeFilter.has(item.type as "note"))
    .map((item) => ({ item, score: scoreItem(item, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ item }) => item)

  return {
    content: [
      {
        type: "text" as const,
        text: scored.length > 0
          ? JSON.stringify(scored, null, 2)
          : `No memory items found matching "${args.query}".`
      }
    ]
  }
}
