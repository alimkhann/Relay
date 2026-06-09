import { NextResponse } from "next/server"

import { getCachedProjectDashboardForUser } from "@/server/cache/read-model-cache"
import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeActionQuota, consumeMcpReadQuota, consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { deleteProjectForUser, updateProjectForUser } from "@/server/services/project-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "project:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }
  const dashboard = await getCachedProjectDashboardForUser(viewer.userId, id)

  if (!dashboard) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  return NextResponse.json({ project: dashboard.project, dashboard })
})

export const PATCH = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "project:write")
  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId)
  } else {
    await consumeActionQuota(viewer.userId, "write")
  }
  const project = await updateProjectForUser(viewer.userId, id, await request.json())
  return NextResponse.json({ project })
})

export const DELETE = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "project:write")
  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId)
  } else {
    await consumeActionQuota(viewer.userId, "write")
  }
  await deleteProjectForUser(viewer.userId, id)
  return NextResponse.json({ deleted: true })
})
