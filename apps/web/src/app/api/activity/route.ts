import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer } from "@/server/policies/viewer"
import { listActivityFeedForUser } from "@/server/services/activity-service"

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const feed = await listActivityFeedForUser(viewer.userId)
  return NextResponse.json({ feed })
})
