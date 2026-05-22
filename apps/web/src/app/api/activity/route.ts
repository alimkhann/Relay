import { NextResponse } from "next/server"

import { listCachedActivityFeedForUser } from "@/server/cache/read-model-cache"
import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const feed = await listCachedActivityFeedForUser(viewer.userId)
  return NextResponse.json({ feed })
})
