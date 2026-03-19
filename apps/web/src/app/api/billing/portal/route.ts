import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireSessionViewer } from "@/server/policies/viewer"
import { createPolarPortalForUser } from "@/server/services/billing-service"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"

export const POST = withApiAuth(async (request: Request) => {
  await assertIpRateLimit(request, "billing_portal_ip", 20)
  const viewer = await requireSessionViewer()
  const result = await createPolarPortalForUser(viewer.userId)
  return NextResponse.json(result, { status: 201 })
})
