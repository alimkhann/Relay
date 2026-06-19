import { z } from "zod"
import type { RelayClient } from "../client.js"

export const addMemorySchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided. Personal memory is just a kind='personal' project — pass its id to write there."),
  type: z
    .enum(["note", "decision", "constraint", "requirement", "task", "artifact"])
    .describe("Memory item type (used by regular projects)"),
  personalCategory: z
    .enum(["person", "company", "concept", "event", "meeting", "signals", "note"])
    .optional()
    .describe(
      "Personal-memory Folk category. REQUIRED when writing to the Personal (kind='personal') project so the item appears in the right column — choose the best fit (person/company/concept/event/meeting/signals/note). Ignored for regular projects.",
    ),
  content: z.string().describe("Memory item content"),
  title: z.string().optional().describe("Optional title for the memory item"),
  pinned: z.boolean().optional().describe("Whether to pin this memory item"),
  tags: z.array(z.string()).optional().describe("Tags for categorization and search (e.g., ['auth', 'security'])"),
  forgetAfter: z.string().datetime().optional().describe("ISO timestamp after which this memory auto-archives. Use for temporary decisions or time-bound context.")
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
      tags: args.tags ?? [],
      metadata: {
        source: "mcp",
        authority: "work_session",
        durability: args.type === "decision" || args.type === "constraint" ? "durable" : "working",
        validationState: "inferred",
        // Personal projects bucket by metadata.personalCategory (not the type
        // enum); set it so the item lands in the right column.
        ...(args.personalCategory ? { personalCategory: args.personalCategory } : {})
      },
      // Source provenance: mark as MCP-sourced
      sourceSurface: "mcp",
      capturedAt: new Date().toISOString(),
      forgetAfter: args.forgetAfter ?? null
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
