import { z } from "zod"
import type { RelayClient } from "../client.js"

export const addMemorySchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  spaceId: z.string().optional().describe("Space ID (personal or project). If omitted, falls back to projectId resolution."),
  type: z
    .enum(["note", "decision", "constraint", "requirement", "task", "artifact"])
    .describe("Memory item type"),
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
  // Personal-space writes use the space-scoped endpoint. Project writes
  // continue to hit the legacy project endpoint so existing routing stays
  // unaffected during the cutover.
  const isPersonalSpace = Boolean(args.spaceId && !args.projectId)
  const endpoint = isPersonalSpace
    ? `/api/spaces/${args.spaceId}/memory`
    : `/api/projects/${resolvedProjectId}/memory`

  const data = await client.post<CreateMemoryResponse>(
    endpoint,
    {
      projectId: resolvedProjectId,
      spaceId: args.spaceId ?? null,
      type: args.type,
      content: args.content,
      title: args.title ?? null,
      pinned: args.pinned ?? false,
      tags: args.tags ?? [],
      metadata: {
        source: "mcp",
        authority: "work_session",
        durability: args.type === "decision" || args.type === "constraint" ? "durable" : "working",
        validationState: "inferred"
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
