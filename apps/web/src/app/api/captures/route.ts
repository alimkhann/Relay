import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { saveCapture } from "@/server/services/capture-service"
import { consumeCaptureQuota } from "@/server/services/entitlement-service"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"

export const POST = withApiAuth(async (request: Request) => {
  await assertIpRateLimit(request, "capture_ingest_ip", 20)
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  await consumeCaptureQuota(viewer.userId)
  const capture = await saveCapture(viewer.userId, await request.json())
  return NextResponse.json(capture, { status: 201 })
})
