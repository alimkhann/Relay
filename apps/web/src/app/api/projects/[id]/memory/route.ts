import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer } from "@/server/policies/viewer"
import { createMemoryItem, listProjectMemory } from "@/server/services/memory-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  const memory = await listProjectMemory(viewer.userId, id)
  return NextResponse.json({ memory })
})

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  const body = await request.json()
  const item = await createMemoryItem(viewer.userId, { ...body, projectId: id })
  return NextResponse.json({ item }, { status: 201 })
})
