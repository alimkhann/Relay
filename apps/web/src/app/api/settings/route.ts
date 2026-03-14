import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer } from "@/server/policies/viewer"
import { getResolvedOnboardingStateForUser } from "@/server/services/onboarding-service"
import { listExtensionTokensForUser } from "@/server/services/extension-token-service"
import { getUserSettings, updateUserSettings } from "@/server/services/settings-service"

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const [settings, tokens, onboarding] = await Promise.all([
    getUserSettings(viewer.userId),
    listExtensionTokensForUser(viewer.userId),
    getResolvedOnboardingStateForUser(viewer.userId)
  ])
  const hasConnectedExtension = tokens.some((token) => !token.revokedAt)
  return NextResponse.json({ settings, hasConnectedExtension, onboarding })
})

export const PATCH = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const settings = await updateUserSettings(viewer.userId, await request.json())
  return NextResponse.json({ settings })
})
