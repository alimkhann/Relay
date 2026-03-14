"use server"

import { redirect } from "next/navigation"

import { requireAuthServer } from "@/lib/auth/server"

export async function signOutAction() {
  const result = await requireAuthServer().signOut()

  if (result?.error) {
    throw new Error(result.error.message ?? "Sign out failed.")
  }

  redirect("/get-started")
}
