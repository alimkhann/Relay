import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer } from "@/server/policies/viewer"
import { getUserSettings, updateUserSettings } from "@/server/services/settings-service"

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const settings = await getUserSettings(viewer.userId)
  return NextResponse.json({ settings })
})

export const PATCH = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const settings = await updateUserSettings(viewer.userId, await request.json())
  return NextResponse.json({ settings })
})
