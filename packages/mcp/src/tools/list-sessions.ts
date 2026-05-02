import { z } from "zod"
import type { RelayClient } from "../client.js"

export const listSessionsSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  includeArchived: z.boolean().optional().describe("Include archived source sessions and closed work sessions."),
  surfaces: z.array(z.string()).optional().describe("Optional surface filters such as chatgpt, claude, mcp, or codex."),
  limit: z.number().int().positive().max(100).optional().describe("Maximum number of sessions to return per session family."),
})

export async function listSessions(
  client: RelayClient,
  args: z.infer<typeof listSessionsSchema>,
  resolvedProjectId: string,
) {
  const params = new URLSearchParams()
  if (args.includeArchived) params.set("includeArchived", "true")
  if (args.limit) params.set("limit", String(args.limit))
  for (const surface of args.surfaces ?? []) {
    params.append("surface", surface)
  }

  const suffix = params.toString()
  const data = await client.get<{
    groupedSessions: unknown[]
    sourceSessions: unknown[]
    workSessions: unknown[]
  }>(`/api/projects/${resolvedProjectId}/sessions${suffix ? `?${suffix}` : ""}`)

  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }]
  }
}
