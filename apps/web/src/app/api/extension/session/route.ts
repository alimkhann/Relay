import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service"
import { ensurePersonalProjectForUser, listProjectsForUser } from "@/server/services/project-service"
import { getUserSettings } from "@/server/services/settings-service"

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  await ensurePersonalProjectForUser(viewer.userId)
  const [projects, settings, onboarding] = await Promise.all([
    listProjectsForUser(viewer.userId, { includePersonal: true }),
    getUserSettings(viewer.userId),
    getResolvedOnboardingStateForUser(viewer.userId)
  ])

  return NextResponse.json({
    userId: viewer.userId,
    projects,
    settings,
    onboarding,
    features: {
      // Surfaces the "also save to" multi-project picker only when the server
      // actually honors additionalProjectIds.
      multiProjectCapture: process.env.RELAY_MULTI_PROJECT_CAPTURE === "true"
    }
  })
})
