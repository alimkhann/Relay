"use server"

import { redirect } from "next/navigation"

import { clearLocalSessionCookie } from "@/lib/auth/local-session"
import { getAuthProvider } from "@/lib/auth/provider"
import { requireAuthServer } from "@/lib/auth/server"

export async function signOutAction() {
  if (getAuthProvider() === "local") {
    await clearLocalSessionCookie()
    redirect("/get-started")
  }

  const result = await requireAuthServer().signOut()

  if (result?.error) {
    throw new Error(result.error.message ?? "Sign out failed.")
  }

  redirect("/get-started")
}
