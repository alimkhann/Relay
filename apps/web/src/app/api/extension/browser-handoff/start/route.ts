import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer } from "@/server/policies/viewer"
import { startBrowserSessionHandoff } from "@/server/services/browser-session-handoff-service"

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const result = await startBrowserSessionHandoff(viewer.userId, await request.json())
  return NextResponse.json(result, { status: 201 })
})
