import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { BadRequestError } from "@/server/http/errors"
import { requireViewerProject, requireViewerScope, resolveViewer } from "@/server/policies/viewer"
import { chargeViewerWriteQuota } from "@/server/services/charge-viewer-write-quota"
import { transferMemoryItem } from "@/server/services/memory-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  requireViewerScope(viewer, "memory:write")
  const body = await request.json()
  if (!body || typeof body !== "object" || !("targetProjectId" in body)) {
    throw new BadRequestError("targetProjectId is required")
  }
  requireViewerProject(viewer, String((body as { targetProjectId?: unknown }).targetProjectId), "memory:write")
  await chargeViewerWriteQuota(viewer)
  const { id } = await params
  const result = await transferMemoryItem(viewer.userId, id, body, viewer.mode === "mcp" ? viewer.projectId : null)
  return NextResponse.json(result)
})