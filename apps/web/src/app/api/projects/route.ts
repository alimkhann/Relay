import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { listCachedProjectsForUser } from "@/server/cache/read-model-cache"
import { consumeMcpReadQuota } from "@/server/services/entitlement-service"
import { rejectMcpViewer, resolveViewer, requireViewerScope } from "@/server/policies/viewer"
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service"
import { createProjectForUser } from "@/server/services/project-service"

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  requireViewerScope(viewer, "project:read")
  if (viewer.mode === "mcp") {
    await consumeMcpReadQuota(viewer.userId)
  }
  const projects = await listCachedProjectsForUser(viewer.userId)
  return NextResponse.json({ projects })
})

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer, "Scoped MCP tokens cannot create projects.")
  const project = await createProjectForUser(viewer.userId, await request.json(), {
    onboardingVia: viewer.mode === "extension" ? "extension" : "web"
  })
  const onboarding = await getResolvedOnboardingStateForUser(viewer.userId, { projects: [{ id: project.id }] })
  return NextResponse.json({ project, onboarding }, { status: 201 })
})
