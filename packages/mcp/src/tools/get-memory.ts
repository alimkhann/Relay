import { z } from "zod"
import type { RelayClient } from "../client.js"

export const getMemorySchema = z.object({
  memoryId: z.string().uuid().describe("Memory item ID."),
})

export async function getMemory(
  client: RelayClient,
  args: z.infer<typeof getMemorySchema>,
) {
  const data = await client.get<{ item: unknown }>(`/api/memory/${args.memoryId}`)

  return {
    content: [{ type: "text" as const, text: JSON.stringify(data.item, null, 2) }]
  }
}
