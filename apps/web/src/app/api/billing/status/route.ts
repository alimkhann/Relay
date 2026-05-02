import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireSessionViewer } from "@/server/policies/viewer"
import { getBillingStatusForUser } from "@/server/services/entitlement-service"

export const GET = withApiAuth(async () => {
  const viewer = await requireSessionViewer()
  const billing = await getBillingStatusForUser(viewer.userId)
  return NextResponse.json({ billing })
})
