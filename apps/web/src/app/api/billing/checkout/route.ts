import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import { withApiAuth } from "@/server/http/api-route"
import { requireSessionViewer } from "@/server/policies/viewer"
import { createPolarCheckoutForUser } from "@/server/services/billing-service"
import { decodeReferralCookie, REFERRAL_COOKIE_NAME } from "@/server/services/referral-service"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"

export const POST = withApiAuth(async (request: Request) => {
  await assertIpRateLimit(request, "billing_checkout_ip", 10)
  const viewer = await requireSessionViewer()
  const body = await request.json()
  const referralCode =
    typeof body?.referralCode === "string"
      ? body.referralCode
      : decodeReferralCookie((await cookies()).get(REFERRAL_COOKIE_NAME)?.value)
  const result = await createPolarCheckoutForUser(
    { id: viewer.userId, email: viewer.email, name: viewer.name },
    { ...body, referralCode: referralCode ?? undefined },
  )
  return NextResponse.json(result, { status: 201 })
})
