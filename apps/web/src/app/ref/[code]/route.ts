import { NextResponse } from "next/server"

import {
  encodeReferralCookie,
  getReferralCookieOptions,
  REFERRAL_COOKIE_NAME,
} from "@/server/services/referral-service"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const response = NextResponse.redirect(new URL("/get-started", request.url))

  if (/^[A-Za-z0-9_-]{6,32}$/.test(code)) {
    response.cookies.set(REFERRAL_COOKIE_NAME, encodeReferralCookie(code), getReferralCookieOptions())
  }

  return response
}
