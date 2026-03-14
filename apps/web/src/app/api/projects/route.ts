import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer } from "@/server/policies/viewer"
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service"
import { createProjectForUser, listProjectsForUser } from "@/server/services/project-service"

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const projects = await listProjectsForUser(viewer.userId)
  return NextResponse.json({ projects })
})

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const project = await createProjectForUser(viewer.userId, await request.json(), {
    onboardingVia: viewer.mode === "extension" ? "extension" : "web"
  })
  const onboarding = await getResolvedOnboardingStateForUser(viewer.userId, { projects: [{ id: project.id }] })
  return NextResponse.json({ project, onboarding }, { status: 201 })
})
