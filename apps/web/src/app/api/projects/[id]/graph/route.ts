import { NextResponse } from "next/server"
import type { ProjectGraphDensity } from "@relay/shared"

import { withApiAuth } from "@/server/http/api-route"
import { getCachedProjectGraphForUser } from "@/server/cache/read-model-cache"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"

function graphDensity(value: string | null): ProjectGraphDensity {
  return value === "full" ? "full" : "compact"
}

function includeEvidence(value: string | null) {
  return value === "true" || value === "1"
}

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:read")

  const url = new URL(request.url)
  const snapshot = await getCachedProjectGraphForUser(viewer.userId, id, {
    density: graphDensity(url.searchParams.get("density")),
    includeEvidence: includeEvidence(url.searchParams.get("includeEvidence")),
  })

  return NextResponse.json(snapshot)
})
