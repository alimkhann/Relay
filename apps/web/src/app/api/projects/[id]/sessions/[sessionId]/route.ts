import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireViewerProject, resolveViewer } from "@/server/policies/viewer"
import { consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { archiveProjectSession } from "@/server/services/project-governance-service"

export const PATCH = withApiAuth(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string; sessionId: string }> }
  ) => {
    const viewer = await resolveViewer(request.headers.get("authorization"))
    const { id, sessionId } = await params
    requireViewerProject(viewer, id, "project:write")
    if (viewer.mode === "mcp") {
      await consumeMcpWriteQuota(viewer.userId)
    }
    const session = await archiveProjectSession(viewer.userId, id, sessionId, await request.json())
    return NextResponse.json({ session })
  }
)
