"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { createServiceRepositoryBundle } from "@relay/db"

import { clearLocalSessionCookie } from "@/lib/auth/local-session"
import { getAuthProvider } from "@/lib/auth/provider"
import { requireSessionViewer } from "@/server/policies/viewer"
import { deleteAccountForUser } from "@/server/services/account-deletion-service"
import { sendAccountDeletedEmail } from "@/server/services/email-service"

const NEON_SESSION_COOKIE_NAMES = [
  "__Secure-neon-auth.session_token",
  "__Secure-neon-auth.local.session_data",
]

async function clearNeonSessionCookies() {
  const cookieStore = await cookies()
  for (const name of NEON_SESSION_COOKIE_NAMES) {
    cookieStore.set(name, "", {
      path: "/",
      expires: new Date(0),
      maxAge: 0,
      sameSite: "lax",
      secure: true,
      httpOnly: true,
    })
  }
}

export async function deleteAccountAction() {
  const viewer = await requireSessionViewer()

  const repositories = createServiceRepositoryBundle()
  const profile = await repositories.profiles.getById(viewer.userId)
  const email = profile?.email ?? viewer.email
  const name = profile?.displayName ?? viewer.name ?? null

  if (getAuthProvider() === "local") {
    await clearLocalSessionCookie()
    await repositories.provider.query(`delete from profiles where id = $1`, [viewer.userId])
    if (email) void sendAccountDeletedEmail(email, name)
    redirect("/get-started")
  }

  await deleteAccountForUser(viewer.userId)
  await clearNeonSessionCookies()
  if (email) void sendAccountDeletedEmail(email, name)

  redirect("/get-started")
}
