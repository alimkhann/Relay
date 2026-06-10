import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireViewerProject, resolveViewer } from "@/server/policies/viewer"
import { consumeActionQuota, consumeMcpReadQuota, consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { getProjectSettings, updateProjectSettings } from "@/server/services/project-settings-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "project:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }
  const settings = await getProjectSettings(viewer.userId, id)
  return NextResponse.json({ settings })
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
  const settings = await updateProjectSettings(viewer.userId, id, await request.json())
  return NextResponse.json({ settings })
})
