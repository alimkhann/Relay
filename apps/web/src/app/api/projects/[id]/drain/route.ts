import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer } from "@/server/policies/viewer"
import { drainDigestJobs } from "@/server/services/digest-service"

export const POST = withApiAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const { id: projectId } = await params

  await drainDigestJobs(viewer.userId, 6)

  return NextResponse.json({ ok: true, projectId })
})
