import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { getLatestBootstrapForProject } from "@/server/services/bootstrap-service"
import { consumeExtensionReadQuota, consumeMcpReadQuota } from "@/server/services/entitlement-service"
import { recordSyncMarkForUser } from "@/server/services/sync-mark-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "brief:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  } else if (viewer.mode === "extension") {
    await consumeExtensionReadQuota(viewer.userId)
  }
  const { searchParams } = new URL(request.url)
  const targetProfileKey = searchParams.get("targetProfileKey") ?? "chatgpt_planning"
  const kind = (searchParams.get("kind") as "quick_continuity" | "fresh_chat_bootstrap" | null) ?? "fresh_chat_bootstrap"
  const syncSurface = searchParams.get("syncSurface")
  const packet = await getLatestBootstrapForProject(viewer.userId, id, targetProfileKey, kind)
  if (packet && syncSurface) {
    await recordSyncMarkForUser(viewer.userId, id, syncSurface as Parameters<typeof recordSyncMarkForUser>[2])
  }
  return NextResponse.json({ packet })
})
