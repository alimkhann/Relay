import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer } from "@/server/policies/viewer"
import { getProjectDashboardForUser, updateProjectForUser } from "@/server/services/project-service"

export const GET = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  const dashboard = await getProjectDashboardForUser(viewer.userId, id)

  if (!dashboard) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  return NextResponse.json({ project: dashboard.project, dashboard })
})

export const PATCH = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id } = await params
  const project = await updateProjectForUser(viewer.userId, id, await request.json())
  return NextResponse.json({ project })
})
