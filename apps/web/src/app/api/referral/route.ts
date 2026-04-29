import { NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireSessionViewer } from "@/server/policies/viewer"
import { getReferralProgramForUser } from "@/server/services/referral-service"

export const GET = withApiAuth(async () => {
  const viewer = await requireSessionViewer()
  const program = await getReferralProgramForUser(viewer.userId)
  return NextResponse.json({ code: program.code, link: program.link })
})
