import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireSessionViewer } from "@/server/policies/viewer"
import { listProjectsForUser } from "@/server/services/project-service"
import { getUserSettings } from "@/server/services/settings-service"
import { listExtensionTokensForUser } from "@/server/services/extension-token-service"

export const GET = withApiAuth(async (_request: Request) => {
  const viewer = await requireSessionViewer()
  const [projects, settings, tokens] = await Promise.all([
    listProjectsForUser(viewer.userId),
    getUserSettings(viewer.userId),
    listExtensionTokensForUser(viewer.userId)
  ])

  return NextResponse.json({
    userId: viewer.userId,
    projects,
    settings,
    tokens
  })
})
