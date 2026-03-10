import { NextResponse } from "next/server"

import { resolveViewer } from "@/server/policies/viewer"
import { composeContextForProject } from "@/server/services/context-service"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await resolveViewer(request.headers.get("authorization")?.replace("Bearer ", ""))
  const { id } = await params
  const result = await composeContextForProject(viewer.userId, id, await request.json())
  return NextResponse.json(result, { status: 201 })
}
