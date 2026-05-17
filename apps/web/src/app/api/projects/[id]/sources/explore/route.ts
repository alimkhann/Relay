import { NextResponse } from "next/server"
import { exploreProjectSourcesSchema } from "@relay/shared"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeExternalSourceMcpActionQuota, consumeMcpReadQuota } from "@/server/services/entitlement-service"
import { exploreProjectSources } from "@/server/services/source-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
    await consumeExternalSourceMcpActionQuota(viewer.userId)
  }
  const searchParams = new URL(request.url).searchParams
  const parsed = exploreProjectSourcesSchema.parse({
    sourceId: searchParams.get("sourceId") ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
  })
  const result = await exploreProjectSources(viewer.userId, id, parsed)
  return NextResponse.json(result)
})
