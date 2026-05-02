import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireSessionViewer } from "@/server/policies/viewer"
import { resyncBillingStateForUser } from "@/server/services/billing-service"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"

export const POST = withApiAuth(async (request: Request) => {
  await assertIpRateLimit(request, "billing_resync_ip", 10)
  const viewer = await requireSessionViewer()
  await resyncBillingStateForUser(viewer.userId)
  return NextResponse.json({ ok: true }, { status: 200 })
})
