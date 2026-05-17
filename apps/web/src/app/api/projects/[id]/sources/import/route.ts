import { NextResponse } from "next/server"
import { importSourceCitationsSchema } from "@relay/shared"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeExternalSourceMcpActionQuota, consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { importSourceCitations } from "@/server/services/source-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:write")
  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId)
    await consumeExternalSourceMcpActionQuota(viewer.userId)
  }
  const parsed = importSourceCitationsSchema.parse(await request.json())
  const result = await importSourceCitations(viewer.userId, id, parsed)
  return NextResponse.json(result, { status: 201 })
})
