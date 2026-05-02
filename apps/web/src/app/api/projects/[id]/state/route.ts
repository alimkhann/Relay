import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { rebuildProjectState, updateProjectStateOverrides } from "@/server/services/project-governance-service"

export const PATCH = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const { id } = await params
  const overrides = await updateProjectStateOverrides(viewer.userId, id, await request.json())
  return NextResponse.json({ overrides })
})

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const { id } = await params
  await rebuildProjectState(viewer.userId, id)
  return NextResponse.json({ ok: true })
})
