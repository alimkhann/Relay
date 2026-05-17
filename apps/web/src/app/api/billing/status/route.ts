import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { rejectMcpViewer, resolveViewer } from "@/server/policies/viewer"
import { getBillingStatusForUser } from "@/server/services/entitlement-service"

// resolveViewer accepts the extension's Authorization: Bearer token and
// falls back to the web session cookie when absent — so this endpoint
// serves both surfaces. (Previously requireSessionViewer was cookie-only,
// so the extension 401'd here and usage/entitlements never loaded.)
export const GET = withApiAuth(async (request: Request) => {
  const viewer = await resolveViewer(request.headers.get("authorization"))
  rejectMcpViewer(viewer)
  const billing = await getBillingStatusForUser(viewer.userId)
  return NextResponse.json({ billing })
})
