import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireSessionViewer } from "@/server/policies/viewer"
import { createPolarCheckoutForUser } from "@/server/services/billing-service"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"

export const POST = withApiAuth(async (request: Request) => {
  await assertIpRateLimit(request, "billing_checkout_ip", 10)
  const viewer = await requireSessionViewer()
  const result = await createPolarCheckoutForUser(
    { id: viewer.userId, email: viewer.email, name: viewer.name },
    await request.json(),
  )
  return NextResponse.json(result, { status: 201 })
})
