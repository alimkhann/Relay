import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { assertHandoffEnabled, consumeHandoffQuota } from "@/server/services/entitlement-service"
import { prepareHandoffForProject } from "@/server/services/handoff-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "brief:read")
  await assertHandoffEnabled(viewer.userId)
  await consumeHandoffQuota(viewer.userId)
  const result = await prepareHandoffForProject(viewer.userId, id, await request.json())
  return NextResponse.json(result, { status: 201 })
})
