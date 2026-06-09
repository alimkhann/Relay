import { NextResponse } from "next/server"

import { getCachedProjectSourceDetail } from "@/server/cache/read-model-cache"
import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeActionQuota, consumeMcpReadQuota, consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { archiveProjectSource, hardDeleteProjectSource } from "@/server/services/source-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string; sourceId: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id, sourceId } = await params
  requireViewerProject(viewer, id, "memory:read")
  if (viewer.mode === "mcp") await consumeMcpReadQuota(viewer.userId)
  const searchParams = new URL(request.url).searchParams
  const limit = Number(searchParams.get("limit"))
  const detail = await getCachedProjectSourceDetail(viewer.userId, id, sourceId, {
    chunkId: searchParams.get("chunkId") ?? undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
  })
  return NextResponse.json(detail)
})

export const DELETE = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string; sourceId: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id, sourceId } = await params
  requireViewerProject(viewer, id, "memory:write")
  if (viewer.mode === "mcp") await consumeMcpWriteQuota(viewer.userId)
  else await consumeActionQuota(viewer.userId, "write")
  const purge = new URL(request.url).searchParams.get("purge")
  if (purge === "1" || purge === "true") {
    await hardDeleteProjectSource(viewer.userId, id, sourceId)
    return NextResponse.json({ ok: true, purged: true })
  }
  await archiveProjectSource(viewer.userId, id, sourceId)
  return NextResponse.json({ ok: true, archived: true })
})
