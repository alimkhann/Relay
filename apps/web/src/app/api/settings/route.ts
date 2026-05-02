import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { getBillingStatusForUser } from "@/server/services/entitlement-service"
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service"
import { listExtensionTokensForUser } from "@/server/services/extension-token-service"
import { getUserSettings, updateUserSettings } from "@/server/services/settings-service"

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const [settings, tokens, onboarding, billing] = await Promise.all([
    getUserSettings(viewer.userId),
    listExtensionTokensForUser(viewer.userId),
    getResolvedOnboardingStateForUser(viewer.userId),
    getBillingStatusForUser(viewer.userId),
  ])
  const hasConnectedExtension = tokens.some((token) => !token.revokedAt)
  return NextResponse.json({ settings: settings.settings, hasConnectedExtension, onboarding, billing })
})

export const PATCH = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const row = await updateUserSettings(viewer.userId, await request.json())
  return NextResponse.json({ settings: row.settings })
})
