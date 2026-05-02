import { z } from "zod"
import type { RelayClient } from "../client.js"

export const listBriefsSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  limit: z.number().int().positive().max(100).optional().describe("Maximum number of briefs to return."),
})

export async function listBriefs(
  client: RelayClient,
  args: z.infer<typeof listBriefsSchema>,
  resolvedProjectId: string,
) {
  const params = new URLSearchParams()
  if (args.limit) params.set("limit", String(args.limit))
  const suffix = params.toString()
  const data = await client.get<{ packets: unknown[] }>(
    `/api/projects/${resolvedProjectId}/bootstrap${suffix ? `?${suffix}` : ""}`
  )

  return {
    content: [{ type: "text" as const, text: JSON.stringify(data.packets, null, 2) }]
  }
}
