import { NextResponse } from "next/server"

import { resolveViewer } from "@/server/policies/viewer"
import { deleteMemoryItem, updateMemoryItem } from "@/server/services/memory-service"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  const item = await updateMemoryItem(viewer.userId, id, await request.json())
  return NextResponse.json({ item })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  await deleteMemoryItem(viewer.userId, id)
  return new NextResponse(null, { status: 204 })
}
