import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { checkpointWorkSession } from "@/server/services/work-session-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:write")
  const body = await request.json()
  const result = await checkpointWorkSession(viewer.userId, id, body)
  return NextResponse.json(result, { status: 201 })
})
