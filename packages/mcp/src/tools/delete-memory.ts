import { z } from "zod"
import type { RelayClient } from "../client.js"

export const deleteMemorySchema = z.object({
  memoryIds: z
    .array(z.string())
    .min(1)
    .describe("IDs of memory items to delete. Supports bulk deletion for cleaning up outdated or contradicting items.")
})

export async function deleteMemory(
  client: RelayClient,
  args: z.infer<typeof deleteMemorySchema>
) {
  const results: string[] = []
  const errors: string[] = []

  for (const id of args.memoryIds) {
    try {
      await client.delete(`/api/memory/${id}`)
      results.push(id)
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : "unknown error"}`)
    }
  }

  const lines: string[] = []
  if (results.length > 0) {
    lines.push(`Deleted ${results.length} memory item(s): ${results.join(", ")}`)
  }
  if (errors.length > 0) {
    lines.push(`Failed to delete ${errors.length} item(s):\n${errors.map((e) => `  - ${e}`).join("\n")}`)
  }

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }]
  }
}
