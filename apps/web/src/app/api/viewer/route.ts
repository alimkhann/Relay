import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer } from "@/server/policies/viewer"

export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))

  return NextResponse.json({
    userId: viewer.userId,
    mode: viewer.mode,
    projectId: viewer.projectId ?? null,
    name: viewer.name ?? null,
    email: viewer.email ?? null,
  })
})
