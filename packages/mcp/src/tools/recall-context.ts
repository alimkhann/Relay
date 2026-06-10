import { z } from "zod"
import type { RelayClient } from "../client.js"

export const recallContextSchema = z.object({
  projectId: z.string().optional().describe("Project ID. Auto-detected if not provided. Personal memory is a kind='personal' project — pass its id to scope the search there."),
  query: z.string().describe("What to search for — e.g., 'authentication approach', 'database choice', 'rate limiting'."),
  lifecycleStates: z.array(z.enum(["active", "cooling", "archived"])).optional(),
  includeArchived: z.boolean().optional(),
  includeObservations: z.boolean().optional(),
  includeEntities: z.boolean().optional(),
})

interface ObservationResult {
  id: string
  content: string
  predicate?: string | null
  subjectEntityId?: string | null
  objectEntityId?: string | null
  objectLiteral?: string | null
  validFrom?: string
  lifecycleState?: string
}

interface EntitySnapshot {
  entities: Array<{ id: string; name: string; kind: string }>
  relations: Array<{ sourceEntityId: string; targetEntityId: string; relationType: string; confidence: number }>
}

interface SearchResponse {
  results: Array<{
    id: string
    type: string
    title: string | null
    content: string
    pinned: boolean
    updatedAt: string
    rank: number
    tags?: string[]
    isArchived?: boolean
  }>
  observations?: ObservationResult[]
  entities?: EntitySnapshot | null
}

interface DashboardResponse {
  dashboard: {
    projectState: {
      projectOverview: string | null
      currentObjective: string | null
      recentProgress: string | null
      decisions: string[]
      constraints: string[]
      openTasks: string[]
    } | null
  }
}

export async function recallContext(
  client: RelayClient,
  args: z.infer<typeof recallContextSchema>,
  resolvedProjectId: string
) {
  const sections: string[] = []

  // 1. Search memory items.
  const params = new URLSearchParams({ q: args.query })
  if (args.lifecycleStates?.length) params.set("lifecycle", args.lifecycleStates.join(","))
  if (args.includeArchived) params.set("includeArchived", "true")
  if (args.includeObservations) params.set("observations", "true")
  if (args.includeEntities) params.set("entities", "true")

  const endpoint = `/api/projects/${resolvedProjectId}/memory/search?${params.toString()}`

  let search: SearchResponse = { results: [] }
  try {
    search = await client.get<SearchResponse>(endpoint)
  } catch {
    // Search failed, continue with state only
  }

  // 2. Project-state snippet.
  try {
    const data = await client.get<DashboardResponse>(`/api/projects/${resolvedProjectId}`)
    const state = data.dashboard.projectState
    if (state) {
      const stateParts: string[] = ["## Project Context"]
      if (state.projectOverview) stateParts.push(`**Overview:** ${state.projectOverview}`)
      if (state.currentObjective) stateParts.push(`**Current Objective:** ${state.currentObjective}`)
      if (state.recentProgress) stateParts.push(`**Recent Progress:** ${state.recentProgress}`)
      sections.push(stateParts.join("\n"))
    }
  } catch {
    // State fetch failed, continue with search results only
  }

  // 3. Format memory results.
  const results = search.results ?? []
  if (results.length > 0) {
    sections.push(`## Matching Memory Items (${results.length})`)
    for (const item of results.slice(0, 15)) {
      const archived = item.isArchived ? " (archived)" : ""
      const label = `[${item.type}]${item.pinned ? " (pinned)" : ""}${archived}`
      const title = item.title ? ` ${item.title}:` : ""
      sections.push(`- ${label}${title} ${item.content}`)
    }
  } else {
    sections.push(`No memory items found matching "${args.query}".`)
  }

  // 4. Observations channel.
  if (args.includeObservations) {
    const observations = search.observations ?? []
    if (observations.length > 0) {
      sections.push(`## Observations (${observations.length})`)
      for (const obs of observations.slice(0, 15)) {
        const svo = obs.predicate ? ` [${obs.predicate}]` : ""
        sections.push(`- ${obs.content}${svo}`)
      }
    } else {
      sections.push("## Observations\nNone found.")
    }
  }

  // 5. Entities channel.
  if (args.includeEntities) {
    const snapshot = search.entities
    const entities = snapshot?.entities ?? []
    const relations = snapshot?.relations ?? []
    if (entities.length > 0 || relations.length > 0) {
      sections.push(`## Entities (${entities.length}) & Relations (${relations.length})`)
      for (const e of entities.slice(0, 20)) sections.push(`- ${e.name} (${e.kind})`)
      // Render relations using entity names instead of raw UUIDs; fall back to
      // the id when an endpoint isn't in the snapshot's entity slice.
      const nameById = new Map(entities.map((e) => [e.id, e.name] as const))
      const label = (id: string) => nameById.get(id) ?? id
      for (const r of relations.slice(0, 20)) {
        sections.push(
          `- ${label(r.sourceEntityId)} —[${r.relationType}]→ ${label(r.targetEntityId)}`,
        )
      }
    } else {
      sections.push("## Entities\nNone found.")
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: sections.join("\n\n")
      }
    ]
  }
}
