import { NextResponse } from "next/server"

import { resolveViewer } from "@/server/policies/viewer"
import { getProjectDashboardForUser, updateProjectForUser } from "@/server/services/project-service"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  const dashboard = await getProjectDashboardForUser(viewer.userId, id)

  if (!dashboard) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  return NextResponse.json({ project: dashboard.project, dashboard })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  const project = await updateProjectForUser(viewer.userId, id, await request.json())
  return NextResponse.json({ project })
}
