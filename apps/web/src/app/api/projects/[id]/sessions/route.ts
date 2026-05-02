import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireViewerProject, resolveViewer } from "@/server/policies/viewer"
import { listSessionsForExplainability } from "@/server/services/continuity-explainability-service"
import { consumeMcpReadQuota } from "@/server/services/entitlement-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "project:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }

  const { searchParams } = new URL(request.url)
  const surfaces = searchParams.getAll("surface")
  const sessions = await listSessionsForExplainability(viewer.userId, id, {
    includeArchived: searchParams.get("includeArchived") === "true",
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    surfaces: surfaces.length > 0 ? surfaces : undefined,
  })

  return NextResponse.json(sessions)
})
