import { NextResponse } from "next/server"

import { createServiceRepositoryBundle } from "@relay/db"

import { getGoogleLogoutUrl } from "@/lib/auth/google-logout"
import { clearLocalSessionCookieFromResponse } from "@/lib/auth/local-session"
import { currentSessionUsesGoogle } from "@/lib/auth/provider-accounts"
import { getAuthProvider } from "@/lib/auth/provider"
import { requireAuthServer } from "@/lib/auth/server"
import { withApiAuth } from "@/server/http/api-route"
import { requireSessionViewer } from "@/server/policies/viewer"
import { deleteAccountForUser } from "@/server/services/account-deletion-service"
import { sendAccountDeletedEmail } from "@/server/services/email-service"
import { assertIpRateLimit } from "@/server/services/rate-limit-service"

const NEON_SESSION_COOKIE_NAMES = [
  "__Secure-neon-auth.session_token",
  "__Secure-neon-auth.local.session_data",
]

function clearNeonSessionCookies(response: NextResponse) {
  for (const name of NEON_SESSION_COOKIE_NAMES) {
    response.cookies.set(name, "", {
      path: "/",
      expires: new Date(0),
      maxAge: 0,
      sameSite: "lax",
      secure: true,
      httpOnly: true,
    })
  }
  return response
}

export const POST = withApiAuth(async (request: Request) => {
  await assertIpRateLimit(request, "account_delete_ip", 3)
  const viewer = await requireSessionViewer()

  // Optional feedback from the goodbye page (best-effort, not persisted)
  let deletionFeedback: { reasons?: string[]; note?: string | null } | null = null
  try {
    const body = (await request.json()) as { feedback?: { reasons?: string[]; note?: string | null } }
    deletionFeedback = body.feedback ?? null
  } catch { /* no body or not JSON — fine */ }

  void deletionFeedback // acknowledged; log via telemetry in future

  const repositories = createServiceRepositoryBundle()
  const profile = await repositories.profiles.getById(viewer.userId)
  const email = profile?.email ?? viewer.email
  const name = profile?.displayName ?? viewer.name ?? null
  const authProvider = getAuthProvider()

  if (authProvider === "local") {
    await repositories.provider.query(`delete from profiles where id = $1`, [viewer.userId])
    const response = NextResponse.json({ ok: true })
    clearLocalSessionCookieFromResponse(response)
    if (email) void sendAccountDeletedEmail(email, name)
    return response
  }

  const authHandler = requireAuthServer().handler()
  const shouldSignOutOfGoogle = await currentSessionUsesGoogle(authHandler, request, new URL(request.url))

  await deleteAccountForUser(viewer.userId)
  const response = NextResponse.json({
    ok: true,
    googleLogoutUrl: shouldSignOutOfGoogle ? getGoogleLogoutUrl().toString() : undefined,
  })
  clearNeonSessionCookies(response)
  if (email) void sendAccountDeletedEmail(email, name)
  return response
})
