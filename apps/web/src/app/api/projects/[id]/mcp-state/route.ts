import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireViewerProject, requireViewerScope, resolveViewer } from "@/server/policies/viewer"
import { upsertProjectStateFromMcp } from "@/server/services/mcp-project-state-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params

  if (viewer.mode === "mcp") {
    requireViewerProject(viewer, id, "project:write")
  } else {
    requireViewerScope(viewer, "project:write")
  }

  const state = await upsertProjectStateFromMcp(viewer.userId, id, await request.json())
  return NextResponse.json({ state })
})
