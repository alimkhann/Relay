import { NextResponse } from "next/server"
import { resolveProjectSourcesSchema } from "@relay/shared"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeExternalSourceMcpActionQuota, consumeMcpReadQuota } from "@/server/services/entitlement-service"
import { resolveProjectSources } from "@/server/services/source-resolver-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
    await consumeExternalSourceMcpActionQuota(viewer.userId)
  }
  const parsed = resolveProjectSourcesSchema.parse(await request.json())
  const result = await resolveProjectSources(viewer.userId, id, parsed)
  return NextResponse.json(result)
})
