import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeMcpReadQuota } from "@/server/services/entitlement-service"
import { getProjectContext, searchMemoryItems } from "@/server/services/memory-service"

export const maxDuration = 60

function parseLifecycleStates(value: string | null): string[] | undefined {
  if (!value) return undefined
  const states = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ["active", "cooling", "archived"].includes(s))
  return states.length > 0 ? states : undefined
}

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }
  const url = new URL(request.url)
  const query = url.searchParams.get("q")

  if (!query) {
    return NextResponse.json({ error: "Missing required query parameter: q" }, { status: 400 })
  }

  const typesParam = url.searchParams.get("types")
  const tagsParam = url.searchParams.get("tags")
  const types = typesParam ? typesParam.split(",").filter(Boolean) : undefined
  const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : undefined
  const lifecycleStates = parseLifecycleStates(url.searchParams.get("lifecycle"))
  const includeArchived = url.searchParams.get("includeArchived") === "true"
  const wantObservations = url.searchParams.get("observations") === "true"
  const wantEntities = url.searchParams.get("entities") === "true"

  const { memoryResults, canonResults, queryAnalysis, evidenceTable, currentPreviousHint, temporalHint } =
    await searchMemoryItems(viewer.userId, id, query, { types, tags, lifecycleStates, includeArchived })

  // Memory v2 channels: attach observations + entity-graph snapshot when
  // requested. Non-fatal if v2 tables are absent.
  let observations: unknown[] = []
  let entities: unknown = null
  if (wantObservations || wantEntities) {
    try {
      const aux = await getProjectContext(viewer.userId, id, {
        query,
        includeObservations: wantObservations,
        includeEntities: wantEntities,
        lifecycleStates,
        includeArchived,
      })
      observations = aux.observations
      entities = aux.entities
    } catch {
      // v2 tables not present in this env yet.
    }
  }

  return NextResponse.json({
    results: memoryResults,
    canon: canonResults,
    queryAnalysis,
    evidenceTable,
    currentPreviousHint,
    temporalHint,
    observations,
    entities,
  })
})
