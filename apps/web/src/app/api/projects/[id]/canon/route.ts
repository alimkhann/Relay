import type { CanonEntryKind, CanonEntryStatus } from "@relay/shared"

import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer, requireViewerProject } from "@/server/policies/viewer"
import { consumeMcpReadQuota, consumeMcpWriteQuota } from "@/server/services/entitlement-service"
import { createCanonEntry, listProjectCanon } from "@/server/services/project-canon-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "project:read")

  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }

  const url = new URL(request.url)
  const kinds = url.searchParams.getAll("kind")
  const statuses = url.searchParams.getAll("status")
  const includeEvidence = url.searchParams.get("includeEvidence") === "true"

  const canon = await listProjectCanon(viewer.userId, id, {
    kinds: kinds.length > 0 ? kinds as CanonEntryKind[] : undefined,
    statuses: statuses.length > 0 ? statuses as CanonEntryStatus[] : undefined,
    includeEvidence,
  })

  return NextResponse.json({ canon })
})

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  requireViewerProject(viewer, id, "project:write")

  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId)
  }

  const body = await request.json()
  const canonEntry = await createCanonEntry(viewer.userId, { ...body, projectId: id })
  return NextResponse.json({ canonEntry }, { status: 201 })
})
