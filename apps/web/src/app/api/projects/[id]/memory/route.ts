import { NextResponse } from "next/server"

import { resolveViewer } from "@/server/policies/viewer"
import { createMemoryItem, listProjectMemory } from "@/server/services/memory-service"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const memory = await listProjectMemory(id)
  return NextResponse.json({ memory })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await resolveViewer(request.headers.get("authorization")?.replace("Bearer ", ""))
  const { id } = await params
  const body = await request.json()
  const item = await createMemoryItem(viewer.userId, { ...body, projectId: id })
  return NextResponse.json({ item }, { status: 201 })
}
