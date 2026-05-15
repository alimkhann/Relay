import { NextResponse } from "next/server"
import { searchProjectSourcesSchema } from "@relay/shared"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeExternalSourceMcpActionQuota, consumeMcpReadQuota } from "@/server/services/entitlement-service"
import { searchProjectSources } from "@/server/services/source-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
    await consumeExternalSourceMcpActionQuota(viewer.userId)
  }
  const parsed = searchProjectSourcesSchema.parse(await request.json())
  const results = await searchProjectSources(viewer.userId, id, parsed)
  return NextResponse.json(results)
})
