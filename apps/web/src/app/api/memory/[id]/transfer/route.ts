import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireViewerProject, requireViewerScope, resolveViewer } from "@/server/policies/viewer"
import { consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { transferMemoryItem } from "@/server/services/memory-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  requireViewerScope(viewer, "memory:write")
  if (viewer.mode === "mcp") await consumeMcpWriteQuota(viewer.userId)
  const body = await request.json()
  requireViewerProject(viewer, String(body.targetProjectId), "memory:write")
  const { id } = await params
  const result = await transferMemoryItem(viewer.userId, id, body, viewer.mode === "mcp" ? viewer.projectId : null)
  return NextResponse.json(result)
})
