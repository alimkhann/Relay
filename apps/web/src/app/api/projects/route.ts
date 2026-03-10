import { NextResponse } from "next/server"

import { resolveViewer } from "@/server/policies/viewer"
import { createProjectForUser, listProjectsForUser } from "@/server/services/project-service"

export async function GET(request: Request) {
  const viewer = await resolveViewer(request.headers.get("authorization")?.replace("Bearer ", ""))
  const projects = await listProjectsForUser(viewer.userId)
  return NextResponse.json({ projects })
}

export async function POST(request: Request) {
  const viewer = await resolveViewer(request.headers.get("authorization")?.replace("Bearer ", ""))
  const project = await createProjectForUser(viewer.userId, await request.json())
  return NextResponse.json({ project }, { status: 201 })
}
