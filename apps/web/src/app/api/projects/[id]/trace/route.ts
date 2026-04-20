import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireViewerProject, resolveViewer } from "@/server/policies/viewer"
import { traceContextSources } from "@/server/services/continuity-explainability-service"
import { consumeMcpReadQuota } from "@/server/services/entitlement-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "project:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get("query") ?? undefined
  const stateField = searchParams.get("stateField") ?? undefined
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined

  if (!query && !stateField) {
    return NextResponse.json({ error: "Provide query or stateField." }, { status: 400 })
  }

  const trace = await traceContextSources(viewer.userId, id, {
    query,
    stateField,
    limit,
  })

  return NextResponse.json({ trace })
})
