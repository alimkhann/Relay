import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireSessionViewer } from "@/server/policies/viewer"
import { startExtensionConnect } from "@/server/services/extension-connect-service"

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await requireSessionViewer()
  const result = await startExtensionConnect(viewer.userId, await request.json())
  return NextResponse.json(result, { status: 201 })
})
