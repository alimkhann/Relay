"use server"

import { redirect } from "next/navigation"

import { createRepositoryBundle } from "@relay/db"

import { clearLocalSessionCookie } from "@/lib/auth/local-session"
import { getAuthProvider } from "@/lib/auth/provider"
import { requireAuthServer } from "@/lib/auth/server"
import { requireSessionViewer } from "@/server/policies/viewer"

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

  if (getAuthProvider() === "local") {
    const repositories = createRepositoryBundle()
    await clearLocalSessionCookie()
    await repositories.provider.query(`delete from profiles where id = $1`, [viewer.userId])
    redirect("/get-started")
  }

  const signOutResult = await requireAuthServer().signOut()
  if (signOutResult?.error) {
    throw new Error(signOutResult.error.message ?? "Sign out failed.")
  }

  await deleteAccountForUser(viewer.userId)

  redirect("/get-started")
}
