import { z } from "zod"
import type { RelayClient } from "../client.js"

export const listRecentActivitySchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  limit: z.number().int().positive().max(100).optional().describe("Maximum number of activity entries to return."),
})

export async function listRecentActivity(
  client: RelayClient,
  args: z.infer<typeof listRecentActivitySchema>,
  resolvedProjectId: string,
) {
  const params = new URLSearchParams({ mode: "continuity" })
  if (args.limit) params.set("limit", String(args.limit))

  const data = await client.get<{ activity: unknown[] }>(
    `/api/projects/${resolvedProjectId}/activity?${params.toString()}`
  )

  return {
    content: [{ type: "text" as const, text: JSON.stringify(data.activity, null, 2) }]
  }
}
