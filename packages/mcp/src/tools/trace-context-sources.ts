import { z } from "zod"
import type { RelayClient } from "../client.js"

export const traceContextSourcesSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  query: z.string().optional().describe("Phrase or brief text to trace back to likely sources."),
  stateField: z.string().optional().describe("Structured project-state field to trace, such as currentObjective or decisions[0]."),
  limit: z.number().int().positive().max(50).optional().describe("Maximum number of matches per source family."),
}).refine((value) => Boolean(value.query || value.stateField), {
  message: "Provide query or stateField.",
})

export async function traceContextSources(
  client: RelayClient,
  args: z.infer<typeof traceContextSourcesSchema>,
  resolvedProjectId: string,
) {
  const params = new URLSearchParams()
  if (args.query) params.set("query", args.query)
  if (args.stateField) params.set("stateField", args.stateField)
  if (args.limit) params.set("limit", String(args.limit))

  const data = await client.get<{ trace: unknown }>(
    `/api/projects/${resolvedProjectId}/trace?${params.toString()}`
  )

  return {
    content: [{ type: "text" as const, text: JSON.stringify(data.trace, null, 2) }]
  }
}
