import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { NotFoundError } from "@/server/http/errors"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeMcpReadQuota, consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { getCanonEntry, updateCanonEntry } from "@/server/services/project-canon-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id, entryId } = await params
  requireViewerProject(viewer, id, "project:read")

  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }

  const canonEntry = await getCanonEntry(viewer.userId, id, entryId)
  if (!canonEntry) {
    throw new NotFoundError("Canon entry not found.")
  }

  return NextResponse.json({ canonEntry })
})

export const PATCH = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id, entryId } = await params
  requireViewerProject(viewer, id, "project:write")

  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId)
  }

  const body = await request.json()
  const canonEntry = await updateCanonEntry(viewer.userId, id, entryId, body)
  return NextResponse.json({ canonEntry })
})
