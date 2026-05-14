import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { BadRequestError } from "@/server/http/errors"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeMcpReadQuota } from "@/server/services/entitlement-service"
import { createSourceFromUpload, listProjectSources } from "@/server/services/source-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:read")
  if (viewer.mode === "mcp") await consumeMcpReadQuota(viewer.userId)
  const sources = await listProjectSources(viewer.userId, id)
  return NextResponse.json({ sources })
})

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "memory:write")
  const formData = await request.formData()
  const file = formData.get("file")
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    throw new BadRequestError("A source file is required.")
  }
  const upload = file as File
  const detail = await createSourceFromUpload(viewer.userId, {
    projectId: id,
    fileName: upload.name,
    mimeType: upload.type || "text/plain",
    buffer: Buffer.from(await upload.arrayBuffer()),
  })
  return NextResponse.json(detail, { status: 201 })
})
