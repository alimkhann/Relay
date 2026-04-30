import { NextRequest, NextResponse } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireSessionViewer } from "@/server/policies/viewer"
import { attachReferralForUser, getReferralProgramForUser } from "@/server/services/referral-service"

export const GET = withApiAuth(async () => {
  const viewer = await requireSessionViewer()
  const program = await getReferralProgramForUser(viewer.userId)
  return NextResponse.json({ code: program.code, link: program.link })
})

export const POST = withApiAuth(async (req: NextRequest) => {
  const viewer = await requireSessionViewer()
  const body = await req.json() as { code?: string }
  if (!body.code?.trim()) return NextResponse.json({ ok: false }, { status: 400 })
  await attachReferralForUser({ refereeUserId: viewer.userId, code: body.code.trim() })
  return NextResponse.json({ ok: true })
})
