import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { generateBootstrapForProject } from "@/server/services/bootstrap-service"
import { consumeMcpReadQuota } from "@/server/services/entitlement-service"
import { clearProjectBriefs } from "@/server/services/project-governance-service"
import { recordSyncMarkForUser } from "@/server/services/sync-mark-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "brief:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }
  const input = await request.json()
  const result = await generateBootstrapForProject(viewer.userId, id, input)
  if (result.status === "ready" && input && typeof input === "object" && "syncSurface" in input && typeof input.syncSurface === "string") {
    await recordSyncMarkForUser(viewer.userId, id, input.syncSurface)
  }
  return NextResponse.json(result, { status: result.status === "pending" ? 202 : 201 })
})

export const DELETE = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "brief:read")
  await clearProjectBriefs(viewer.userId, id)
  return NextResponse.json({ ok: true })
})
