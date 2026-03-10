import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { resolveViewer } from "@/server/policies/viewer"
import { saveCapture } from "@/server/services/capture-service"

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  const capture = await saveCapture(viewer.userId, await request.json())
  return NextResponse.json(capture, { status: 201 })
})
