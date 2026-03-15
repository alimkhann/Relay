import { z } from "zod"
import type { RelayClient } from "../client.js"

export const addMemorySchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  type: z
    .enum(["note", "decision", "constraint", "requirement", "task", "artifact"])
    .describe("Memory item type"),
  content: z.string().describe("Memory item content"),
  title: z.string().optional().describe("Optional title for the memory item"),
  pinned: z.boolean().optional().describe("Whether to pin this memory item")
})

interface CreateMemoryResponse {
  item: {
    id: string
    type: string
    title: string | null
    content: string
    pinned: boolean
    updatedAt: string
  }
}

export async function addMemory(
  client: RelayClient,
  args: z.infer<typeof addMemorySchema>,
  resolvedProjectId: string
) {
  const data = await client.post<CreateMemoryResponse>(
    `/api/projects/${resolvedProjectId}/memory`,
    {
      projectId: resolvedProjectId,
      type: args.type,
      content: args.content,
      title: args.title ?? null,
      pinned: args.pinned ?? false,
      metadata: { source: "mcp" }
    }
  )

  return {
    content: [
      {
        type: "text" as const,
        text: `Memory item created: ${data.item.type}${data.item.title ? ` — "${data.item.title}"` : ""} (id: ${data.item.id})`
      }
    ]
  }
}
