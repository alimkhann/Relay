import { z } from "zod"
import type { RelayClient } from "../client.js"

export const archiveSessionSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  sessionId: z.string().uuid().describe("Source session ID to archive or restore."),
  archived: z.boolean().default(true).describe("Archive when true, restore when false."),
})

export async function archiveSession(
  client: RelayClient,
  args: z.infer<typeof archiveSessionSchema>,
  resolvedProjectId: string,
) {
  const data = await client.patch<{ session: unknown }>(
    `/api/projects/${resolvedProjectId}/sessions/${args.sessionId}`,
    { archived: args.archived }
  )

  return {
    content: [{ type: "text" as const, text: JSON.stringify(data.session, null, 2) }]
  }
}
