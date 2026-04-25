import { NextResponse } from "next/server"

import { createRepositoryBundle } from "@relay/db"

import { clearLocalSessionCookieFromResponse } from "@/lib/auth/local-session"
import { getAuthProvider } from "@/lib/auth/provider"
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

  const repositories = createRepositoryBundle()
  const profile = await repositories.profiles.getById(viewer.userId)
  const email = profile?.email ?? viewer.email
  const name = profile?.displayName ?? viewer.name ?? null

  if (getAuthProvider() === "local") {
    await repositories.provider.query(`delete from profiles where id = $1`, [viewer.userId])
    const response = NextResponse.json({ ok: true })
    clearLocalSessionCookieFromResponse(response)
    if (email) void sendAccountDeletedEmail(email, name)
    return response
  }

  await deleteAccountForUser(viewer.userId)
  const response = NextResponse.json({ ok: true })
  clearNeonSessionCookies(response)
  if (email) void sendAccountDeletedEmail(email, name)
  return response
})
