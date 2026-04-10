"use server"

import { redirect } from "next/navigation"

import { createRepositoryBundle } from "@relay/db"

import { clearLocalSessionCookie } from "@/lib/auth/local-session"
import { getAuthProvider } from "@/lib/auth/provider"
import { requireSessionViewer } from "@/server/policies/viewer"
import { sendAccountDeletedEmail } from "@/server/services/email-service"

async function deleteAccountForUser(userId: string) {
  const repositories = createRepositoryBundle()

  // profiles has ON DELETE CASCADE across every public-schema table that
  // references it, so removing the profile row fans out to projects,
  // sessions, memory, entitlements, subscriptions, billing customers,
  // browser session handoffs, work sessions, etc. Then we clean up the
  // neon_auth rows that live outside the cascade chain.
  await repositories.provider.query(`delete from profiles where id = $1`, [userId])
  await repositories.provider.query(
    `delete from neon_auth.account where "userId" = $1::uuid`,
    [userId],
  )
  await repositories.provider.query(
    `delete from neon_auth."user" where id = $1::uuid`,
    [userId],
  )
}

export async function deleteAccountAction() {
  const viewer = await requireSessionViewer()

  const repositories = createRepositoryBundle()
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
  if (email) void sendAccountDeletedEmail(email, name)

  // /auth/sign-out forwards the Neon Auth cookie-clearing Set-Cookie headers
  // onto its redirect response, so the browser lands on /get-started with no
  // live session. Doing it here via the server action avoids the SDK's
  // signOut() swallowing the Set-Cookie headers.
  redirect("/auth/sign-out")
}
