import { z } from "zod"
import type { RelayClient } from "../client.js"

export const listMemorySchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  spaceId: z.string().optional().describe("Space ID (personal or project). Lists that space's memory instead of the project's."),
  archived: z.boolean().optional().describe("Include archived memory items."),
  pinned: z.boolean().optional().describe("Filter by pinned status."),
  tag: z.string().optional().describe("Filter by a specific tag."),
  types: z.array(z.enum(["note", "decision", "constraint", "requirement", "task", "artifact"])).optional().describe("Filter by memory item types."),
  limit: z.number().int().positive().max(100).optional().describe("Maximum number of memory items to return."),
  sort: z.enum(["updated_desc", "created_desc"]).optional().describe("Sort order."),
})

export async function listMemory(
  client: RelayClient,
  args: z.infer<typeof listMemorySchema>,
  resolvedProjectId: string,
) {
  const params = new URLSearchParams()
  if (args.archived) params.set("archived", "true")
  if (typeof args.pinned === "boolean") params.set("pinned", String(args.pinned))
  if (args.tag) params.set("tag", args.tag)
  if (args.limit) params.set("limit", String(args.limit))
  if (args.sort) params.set("sort", args.sort)
  for (const type of args.types ?? []) {
    params.append("type", type)
  }

  const suffix = params.toString()
  // Personal/project space listing routes through the space endpoint; project
  // listing keeps the legacy project endpoint.
  const base = args.spaceId
    ? `/api/spaces/${args.spaceId}/memory`
    : `/api/projects/${resolvedProjectId}/memory`
  try {
    const data = await client.get<{ memory: unknown[] }>(
      `${base}${suffix ? `?${suffix}` : ""}`
    )

    return {
      content: [{ type: "text" as const, text: JSON.stringify(data.memory, null, 2) }]
    }
  } catch (error) {
    if (process.env.RELAY_MCP_DEBUG) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(
        `[relay-mcp] list_memory primary path failed, falling back to dashboard: ${message}`,
      )
    }
    // The dashboard fallback is project-only; for space listing surface the
    // error so the caller can distinguish "API broke" from "empty space".
    if (args.spaceId) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [
          {
            type: "text" as const,
            text: `list_memory failed for space ${args.spaceId}: ${message}\n${JSON.stringify([], null, 2)}`,
          },
        ],
      }
    }
    const dashboard = await client.get<{
      dashboard?: {
        memory?: Array<{
          id: string
          type: string
          title: string | null
          content: string
          pinned?: boolean
          updatedAt?: string
          tags?: string[]
        }>
      }
    }>(`/api/projects/${resolvedProjectId}`)

    const filtered = (dashboard.dashboard?.memory ?? [])
      .filter((item) => (typeof args.pinned === "boolean" ? Boolean(item.pinned) === args.pinned : true))
      .filter((item) => (args.tag ? (item.tags ?? []).includes(args.tag) : true))
      .filter((item) => (args.types?.length ? args.types.includes(item.type as (typeof args.types)[number]) : true))
      .sort((left, right) => {
        const leftTime = new Date(left.updatedAt ?? 0).getTime()
        const rightTime = new Date(right.updatedAt ?? 0).getTime()
        return rightTime - leftTime
      })
      .slice(0, args.limit ?? 100)

    return {
      content: [{ type: "text" as const, text: JSON.stringify(filtered, null, 2) }]
    }
  }
}
