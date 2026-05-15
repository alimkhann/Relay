import { NextResponse } from "next/server"
import { createExternalSourceSchema } from "@relay/shared"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeExternalSourceMcpActionQuota, consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { createExternalSource } from "@/server/services/source-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:write")
  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId)
    await consumeExternalSourceMcpActionQuota(viewer.userId)
  }
  const parsed = createExternalSourceSchema.parse(await request.json())
  const detail = await createExternalSource(viewer.userId, {
    ...parsed,
    projectId: id,
  })
  return NextResponse.json(detail, { status: 201 })
})
