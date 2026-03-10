import { NextResponse } from "next/server"

import { resolveViewer } from "@/server/policies/viewer"
import { bindProject } from "@/server/services/binding-service"

export async function POST(request: Request) {
  const viewer = await resolveViewer(request.headers.get("authorization")?.replace("Bearer ", ""))
  const binding = await bindProject(viewer.userId, await request.json())
  return NextResponse.json({ binding }, { status: 201 })
}
