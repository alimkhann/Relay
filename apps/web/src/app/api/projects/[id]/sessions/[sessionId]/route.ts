import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { archiveProjectSession } from "@/server/services/project-governance-service"

export const PATCH = withApiAuth(
  async (
    request: Request,
    { params }: { params: Promise<{ id: string; sessionId: string }> }
  ) => {
    const viewer = await resolveViewer(request.headers.get("authorization"))
    rejectMcpViewer(viewer)
    const { id, sessionId } = await params
    const session = await archiveProjectSession(viewer.userId, id, sessionId, await request.json())
    return NextResponse.json({ session })
  }
)
