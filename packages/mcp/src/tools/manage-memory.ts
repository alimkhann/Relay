import { z } from "zod"
import type { RelayClient } from "../client.js"

export const manageMemorySchema = z.object({
  action: z.enum(["update", "delete", "archive"]).describe("Action to perform on the memory item(s)"),
  memoryId: z.union([z.string(), z.array(z.string())]).describe("ID or array of IDs of memory items to manage"),
  content: z.string().optional().describe("Updated content (for update action)"),
  title: z.string().optional().describe("Updated title (for update action)"),
  type: z
    .enum(["note", "decision", "constraint", "requirement", "task", "artifact"])
    .optional()
    .describe("Updated type (for update action)"),
  pinned: z.boolean().optional().describe("Whether to pin/unpin (for update action)"),
  tags: z.array(z.string()).optional().describe("Updated tags (for update action)")
})

interface UpdateMemoryResponse {
  item: {
    id: string
    type: string
    title: string | null
    content: string
    pinned: boolean
    updatedAt: string
  }
}

export async function manageMemory(
  client: RelayClient,
  args: z.infer<typeof manageMemorySchema>
) {
  const ids = Array.isArray(args.memoryId) ? args.memoryId : [args.memoryId]

  if (args.action === "delete") {
    const results: string[] = []
    const errors: string[] = []

    for (const id of ids) {
      try {
        await client.delete(`/api/memory/${id}`)
        results.push(id)
      } catch (err) {
        errors.push(`${id}: ${err instanceof Error ? err.message : "unknown error"}`)
      }
    }

    const lines: string[] = []
    if (results.length > 0) lines.push(`Deleted ${results.length} memory item(s): ${results.join(", ")}`)
    if (errors.length > 0) lines.push(`Failed to delete ${errors.length} item(s):\n${errors.map((e) => `  - ${e}`).join("\n")}`)

    return { content: [{ type: "text" as const, text: lines.join("\n") }] }
  }

  if (args.action === "archive") {
    const results: string[] = []
    const errors: string[] = []

    for (const id of ids) {
      try {
        await client.patch<UpdateMemoryResponse>(`/api/memory/${id}`, { isArchived: true })
        results.push(id)
      } catch (err) {
        errors.push(`${id}: ${err instanceof Error ? err.message : "unknown error"}`)
      }
    }

    const lines: string[] = []
    if (results.length > 0) lines.push(`Archived ${results.length} memory item(s): ${results.join(", ")}`)
    if (errors.length > 0) lines.push(`Failed to archive ${errors.length} item(s):\n${errors.map((e) => `  - ${e}`).join("\n")}`)

    return { content: [{ type: "text" as const, text: lines.join("\n") }] }
  }

  // Update action
  if (ids.length !== 1) {
    return {
      content: [{
        type: "text" as const,
        text: "Update action requires exactly one memory ID."
      }]
    }
  }

  const updates: Record<string, unknown> = {}
  if (args.content !== undefined) updates.content = args.content
  if (args.title !== undefined) updates.title = args.title
  if (args.type !== undefined) updates.type = args.type
  if (args.pinned !== undefined) updates.pinned = args.pinned
  if (args.tags !== undefined) updates.tags = args.tags

  const data = await client.patch<UpdateMemoryResponse>(`/api/memory/${ids[0]}`, updates)

  return {
    content: [
      {
        type: "text" as const,
        text: `Memory item updated: ${data.item.type}${data.item.title ? ` — "${data.item.title}"` : ""} (id: ${data.item.id})`
      }
    ]
  }
}
