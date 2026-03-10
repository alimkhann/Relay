import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireSessionViewer } from "@/server/policies/viewer"
import { createExtensionTokenForUser, listExtensionTokensForUser } from "@/server/services/extension-token-service"

export const GET = withApiAuth(async (_request: Request) => {
  const viewer = await requireSessionViewer()
  const tokens = await listExtensionTokensForUser(viewer.userId)
  return NextResponse.json({ tokens })
})

export const POST = withApiAuth(async (request: Request) => {
  const viewer = await requireSessionViewer()
  const result = await createExtensionTokenForUser(viewer.userId, await request.json())
  return NextResponse.json(result, { status: 201 })
})
