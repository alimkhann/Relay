import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeMcpReadQuota, consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { archiveProjectSource, getProjectSourceDetail, hardDeleteProjectSource } from "@/server/services/source-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string; sourceId: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id, sourceId } = await params
  requireViewerProject(viewer, id, "memory:read")
  if (viewer.mode === "mcp") await consumeMcpReadQuota(viewer.userId)
  const detail = await getProjectSourceDetail(viewer.userId, id, sourceId)
  return NextResponse.json(detail)
})

export const DELETE = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string; sourceId: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id, sourceId } = await params
  requireViewerProject(viewer, id, "memory:write")
  if (viewer.mode === "mcp") await consumeMcpWriteQuota(viewer.userId)
  const purge = new URL(request.url).searchParams.get("purge")
  if (purge === "1" || purge === "true") {
    await hardDeleteProjectSource(viewer.userId, id, sourceId)
    return NextResponse.json({ ok: true, purged: true })
  }
  await archiveProjectSource(viewer.userId, id, sourceId)
  return NextResponse.json({ ok: true, archived: true })
})
