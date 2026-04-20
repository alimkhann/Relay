import { z } from "zod"
import type { RelayClient } from "../client.js"

export const listMemorySchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
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
  const data = await client.get<{ memory: unknown[] }>(
    `/api/projects/${resolvedProjectId}/memory${suffix ? `?${suffix}` : ""}`
  )

  return {
    content: [{ type: "text" as const, text: JSON.stringify(data.memory, null, 2) }]
  }
}
