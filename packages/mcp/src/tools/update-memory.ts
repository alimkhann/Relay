import { z } from "zod"
import type { RelayClient } from "../client.js"

export const updateMemorySchema = z.object({
  memoryId: z.string().describe("ID of the memory item to update"),
  content: z.string().optional().describe("Updated content"),
  title: z.string().optional().describe("Updated title"),
  type: z
    .enum(["note", "decision", "constraint", "requirement", "task", "artifact"])
    .optional()
    .describe("Updated type"),
  pinned: z.boolean().optional().describe("Whether to pin/unpin this item")
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

export async function updateMemory(
  client: RelayClient,
  args: z.infer<typeof updateMemorySchema>
) {
  const { memoryId, ...updates } = args

  const data = await client.patch<UpdateMemoryResponse>(
    `/api/memory/${memoryId}`,
    updates
  )

  return {
    content: [
      {
        type: "text" as const,
        text: `Memory item updated: ${data.item.type}${data.item.title ? ` — "${data.item.title}"` : ""} (id: ${data.item.id})`
      }
    ]
  }
}
