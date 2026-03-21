import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { logServerEvent } from "@/server/logging/logger"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { openWorkSession } from "@/server/services/work-session-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:write")
  const body = await request.json()
  try {
    const session = await openWorkSession(viewer.userId, id, body)
    return NextResponse.json({ session }, { status: 201 })
  } catch (error) {
    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "work-session",
      event: "work_session.open_failed",
      message: `Work session open failed: ${error instanceof Error ? error.message : String(error)}`,
      context: {
        projectId: id,
        userId: viewer.userId,
        stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
      },
      error
    })
    throw error
  }
})
