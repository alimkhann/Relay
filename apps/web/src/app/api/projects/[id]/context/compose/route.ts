import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeMcpReadQuota } from "@/server/services/entitlement-service"
import { composeContextForProject } from "@/server/services/context-service"

export const maxDuration = 60

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "brief:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }
  const result = await composeContextForProject(viewer.userId, id, await request.json())
  return NextResponse.json(result, { status: 201 })
})
