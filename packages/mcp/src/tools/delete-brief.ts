import { z } from "zod"
import type { RelayClient } from "../client.js"

export const deleteBriefSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  packetId: z.string().uuid().describe("Brief packet ID to delete."),
})

export async function deleteBrief(
  client: RelayClient,
  args: z.infer<typeof deleteBriefSchema>,
  resolvedProjectId: string,
) {
  await client.delete(`/api/projects/${resolvedProjectId}/bootstrap?packetId=${encodeURIComponent(args.packetId)}`)

  return {
    content: [{ type: "text" as const, text: JSON.stringify({ ok: true, packetId: args.packetId }, null, 2) }]
  }
}
