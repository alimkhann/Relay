import { NextResponse } from "next/server"

import { deleteMemoryItem, updateMemoryItem } from "@/server/services/memory-service"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await updateMemoryItem(id, await request.json())
  return NextResponse.json({ item })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteMemoryItem(id)
  return new NextResponse(null, { status: 204 })
}
