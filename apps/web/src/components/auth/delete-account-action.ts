"use server"

import { redirect } from "next/navigation"

import { createRepositoryBundle } from "@relay/db"

import { clearLocalSessionCookie } from "@/lib/auth/local-session"
import { getAuthProvider } from "@/lib/auth/provider"
import { requireAuthServer } from "@/lib/auth/server"
import { requireSessionViewer } from "@/server/policies/viewer"
import { sendAccountDeletedEmail } from "@/server/services/email-service"

async function deleteAccountForUser(userId: string) {
  const repositories = createRepositoryBundle()

  await repositories.provider.query(
    `with deleted_accounts as (
       delete from neon_auth.account
       where "userId" = $1::uuid
     ),
     deleted_profile as (
       delete from profiles
       where id = $1
     )
     delete from neon_auth."user"
     where id = $1::uuid`,
    [userId]
  )
}

export async function deleteAccountAction() {
  const viewer = await requireSessionViewer()

  // Capture email before deletion since the profile will be removed
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

  const signOutResult = await requireAuthServer().signOut()
  if (signOutResult?.error) {
    throw new Error(signOutResult.error.message ?? "Sign out failed.")
  }

  await deleteAccountForUser(viewer.userId)
  if (email) void sendAccountDeletedEmail(email, name)

  redirect("/get-started")
}
