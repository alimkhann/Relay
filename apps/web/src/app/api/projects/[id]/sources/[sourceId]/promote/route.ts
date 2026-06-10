import { NextResponse } from "next/server"
import { promoteSourceCitationSchema } from "@relay/shared"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeActionQuota, consumeExternalSourceMcpActionQuota, consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { promoteSourceCitation } from "@/server/services/source-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string; sourceId: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id, sourceId } = await params
  requireViewerProject(viewer, id, "memory:write")
  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId)
    await consumeExternalSourceMcpActionQuota(viewer.userId)
  } else {
    await consumeActionQuota(viewer.userId, "write")
  }
  const parsed = promoteSourceCitationSchema.parse(await request.json())
  const result = await promoteSourceCitation(viewer.userId, id, sourceId, parsed)
  return NextResponse.json(result)
})
