import { NextResponse } from "next/server"

import { listCachedProjectsForUser } from "@/server/cache/read-model-cache"
import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { resolveViewerEntitlements } from "@/server/services/entitlement-service"
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service"
import { getUserSettings } from "@/server/services/settings-service"

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const [projects, settings, onboarding, entitlements] = await Promise.all([
    listCachedProjectsForUser(viewer.userId),
    getUserSettings(viewer.userId),
    getResolvedOnboardingStateForUser(viewer.userId),
    resolveViewerEntitlements(viewer.userId)
  ])

  return NextResponse.json({
    userId: viewer.userId,
    projects,
    settings,
    onboarding,
    entitlements
  })
})
