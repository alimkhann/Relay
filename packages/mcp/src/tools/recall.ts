import { z } from "zod"
import type { RelayClient } from "../client.js"
import { recallContext } from "./recall-context.js"
import { getProjectState } from "./get-project-state.js"
import { getMemory } from "./get-memory.js"
import { listMemory } from "./list-memory.js"
import { listSessions } from "./list-sessions.js"
import { listRecentActivity } from "./list-recent-activity.js"
import { listBriefs } from "./list-briefs.js"
import { traceContextSources } from "./trace-context-sources.js"
import { searchContext } from "./search-context.js"

export const recallSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided."),
  spaceId: z.string().optional().describe("Space ID (personal or project). Overrides projectId when provided."),
  query: z.string().optional().describe("Search query — triggers hybrid search across memory items, observations, and canon entries."),
  memoryId: z.string().optional().describe("Get a specific memory item by ID."),
  include: z
    .array(z.enum(["state", "sessions", "activity", "briefs", "trace", "observations", "entities"]))
    .optional()
    .describe("Additional data to include in the response."),
  includeArchived: z
    .boolean()
    .optional()
    .describe("When true, archived items are included in search results (presented as visually distinct). Forgotten items are always excluded."),
  filters: z
    .object({
      types: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      pinned: z.boolean().optional(),
      archived: z.boolean().optional(),
      lifecycleStates: z
        .array(z.enum(["active", "cooling", "archived"]))
        .optional()
        .describe("Filter by lifecycle state. Defaults to ['active'] when omitted."),
    })
    .optional()
    .describe("Filters for memory listing/search."),
  tracePhrase: z.string().optional().describe("Trace provenance of a phrase or field in project context."),
})

export async function recall(
  client: RelayClient,
  args: z.infer<typeof recallSchema>,
  projectId: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const sections: string[] = []
  const include = args.include ?? []
  const spaceId = args.spaceId
  const wantObservations = include.includes("observations")
  const wantEntities = include.includes("entities")
  const lifecycleStates = args.filters?.lifecycleStates
  const includeArchived = args.includeArchived

  if (args.memoryId) {
    const result = await getMemory(client, { memoryId: args.memoryId })
    sections.push(extractText(result))
  }

  if (args.query) {
    const result = await recallContext(
      client,
      {
        query: args.query,
        projectId,
        spaceId,
        lifecycleStates,
        includeArchived,
        includeObservations: wantObservations,
        includeEntities: wantEntities,
      },
      projectId,
    )
    sections.push(extractText(result))
  } else if (!args.memoryId && !include.length && !args.tracePhrase) {
    // No query: list the space's memory when space-scoped; otherwise the
    // project-state snapshot.
    if (spaceId) {
      const result = await listMemory(client, { projectId, spaceId }, projectId)
      sections.push(extractText(result))
    } else {
      const result = await getProjectState(client, projectId)
      sections.push(extractText(result))
    }
  } else if (!args.query && (wantObservations || wantEntities)) {
    // observations/entities are search-scoped channels — they need a query.
    sections.push("Provide a `query` to retrieve observations/entities.")
  }

  if (args.filters && !args.query) {
    const result = await listMemory(
      client,
      {
        projectId,
        spaceId,
        types: args.filters.types as ("note" | "decision" | "constraint" | "requirement" | "task" | "artifact")[],
        // listMemory accepts singular `tag`; pass the first if any provided
        tag: args.filters.tags?.[0],
        pinned: args.filters.pinned,
        archived: args.filters.archived,
      },
      projectId,
    )
    sections.push(extractText(result))
  }

  if (args.query && args.filters) {
    const result = await searchContext(
      client,
      {
        query: args.query,
        projectId,
        spaceId,
        types: args.filters.types as ("note" | "decision" | "constraint" | "requirement" | "task" | "artifact")[],
        tags: args.filters.tags,
        lifecycleStates,
        includeArchived,
      },
      projectId,
    )
    sections.push(extractText(result))
  }

  // Skip when args.query is set — recallContext already emits a project-state block
  if (include.includes("state") && !args.query) {
    const result = await getProjectState(client, projectId)
    sections.push(extractText(result))
  }

  if (include.includes("sessions")) {
    const result = await listSessions(client, { projectId }, projectId)
    sections.push(extractText(result))
  }

  if (include.includes("activity")) {
    const result = await listRecentActivity(client, { projectId }, projectId)
    sections.push(extractText(result))
  }

  if (include.includes("briefs")) {
    const result = await listBriefs(client, { projectId }, projectId)
    sections.push(extractText(result))
  }

  if (args.tracePhrase || include.includes("trace")) {
    const phrase = args.tracePhrase ?? args.query ?? ""
    if (phrase) {
      const result = await traceContextSources(client, { query: phrase, projectId }, projectId)
      sections.push(extractText(result))
    }
  }

  if (sections.length === 0) {
    const result = await getProjectState(client, projectId)
    sections.push(extractText(result))
  }

  return {
    content: [{ type: "text" as const, text: sections.join("\n\n---\n\n") }],
  }
}

function extractText(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content.map((c) => c.text).join("\n")
}
