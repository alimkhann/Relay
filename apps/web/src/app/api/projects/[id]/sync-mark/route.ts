import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeMcpBasicReadQuota } from "@/server/services/entitlement-service"
import { getSyncMarkForUser } from "@/server/services/sync-mark-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "brief:read")

  if (viewer.mode === "mcp") {
    await consumeMcpBasicReadQuota(viewer.userId)
  }

  const { searchParams } = new URL(request.url)
  const surface = (searchParams.get("surface") ?? "mcp") as Parameters<typeof getSyncMarkForUser>[2]
  const syncMark = await getSyncMarkForUser(viewer.userId, id, surface)
  return NextResponse.json({ syncMark })
})
