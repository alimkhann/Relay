import { NextResponse, type NextRequest } from "next/server"

import { withApiAuth } from "@/server/http/api-route"
import { requireSessionViewer, syncViewerProfile } from "@/server/policies/viewer"
import { attachReferralForUser, getReferralProgramForUser } from "@/server/services/referral-service"

export const GET = withApiAuth(async () => {
  const viewer = await requireSessionViewer()
  await syncViewerProfile(viewer)
  const program = await getReferralProgramForUser(viewer.userId)
  return NextResponse.json({ code: program.code, link: program.link })
})

export const POST = withApiAuth(async (req: NextRequest) => {
  const viewer = await requireSessionViewer()
  await syncViewerProfile(viewer)
  const body = await req.json() as { code?: string }
  if (!body.code?.trim()) return NextResponse.json({ ok: false, reason: "missing_code" }, { status: 400 })
  const result = await attachReferralForUser({ refereeUserId: viewer.userId, code: body.code.trim() })
  if (!result) return NextResponse.json({ ok: false, reason: "invalid_code" }, { status: 400 })
  return NextResponse.json({ ok: true })
})
