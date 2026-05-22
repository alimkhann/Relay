import { NextResponse } from "next/server"

import { createRepositoryBundle, type RepositoryBundle } from "@relay/db"
import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerScope } from "@/server/policies/viewer"
import { consumeMcpReadQuota } from "@/server/services/entitlement-service"
import { getSpaceContext, searchMemoryItems } from "@/server/services/memory-service"

export const maxDuration = 60

/**
 * Memory v2: space-scoped hybrid search. Mirrors the project search route but
 * scopes by space_id (so personal-space recall works) and can attach the
 * observation + entity-graph channels when requested.
 */

async function resolveSpaceForViewer(
  repositories: RepositoryBundle,
  viewerUserId: string,
  spaceId: string,
): Promise<{ id: string; projectId: string | null } | null> {
  const rows = await repositories.provider.query(
    `SELECT s.id, s.project_id
     FROM spaces s
     JOIN space_members sm ON sm.space_id = s.id
     WHERE s.id = $1 AND sm.user_id = $2
     LIMIT 1`,
    [spaceId, viewerUserId],
  )
  if (rows.length === 0) return null
  const r = rows[0] as Record<string, unknown>
  return { id: String(r.id), projectId: r.project_id ? String(r.project_id) : null }
}

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
  requireViewerScope(viewer, "memory:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }
  const { id } = await params
  const repositories = createRepositoryBundle(viewer.userId)
  const space = await resolveSpaceForViewer(repositories, viewer.userId, id)
  if (!space) {
    return NextResponse.json({ error: "Space not found or not accessible." }, { status: 404 })
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

  const { memoryResults, queryAnalysis, evidenceTable, currentPreviousHint, temporalHint } =
    await searchMemoryItems(viewer.userId, space.projectId ?? "", query, {
      types,
      tags,
      spaceId: id,
      lifecycleStates,
      includeArchived,
    })

  const aux =
    wantObservations || wantEntities
      ? await getSpaceContext(viewer.userId, id, {
          query,
          includeObservations: wantObservations,
          includeEntities: wantEntities,
          lifecycleStates,
          includeArchived,
        })
      : { observations: [], entities: null }

  return NextResponse.json({
    results: memoryResults,
    canon: [],
    queryAnalysis,
    evidenceTable,
    currentPreviousHint,
    temporalHint,
    observations: aux.observations,
    entities: aux.entities,
  })
})
