"use client"

import { clearRelayQueryCache } from "@/lib/query/clear-cache"

interface SignOutPayload {
  redirectTo?: unknown
}

function navigateAfterSignOut(redirectTo: string) {
  window.location.assign(redirectTo)
}

async function clearRelayQueryCacheBestEffort() {
  await Promise.race([
    clearRelayQueryCache(),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 250)
    }),
  ])
}

export async function signOutFromBrowser() {
  try {
    await clearRelayQueryCacheBestEffort()

    const response = await fetch("/auth/sign-out", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: "{}",
    })

    if (!response.ok) {
      throw new Error(`Sign-out failed: ${response.status}`)
    }

    const payload = (await response.json().catch(() => ({}))) as SignOutPayload
    const redirectTo = typeof payload.redirectTo === "string" ? payload.redirectTo : "/get-started"
    navigateAfterSignOut(redirectTo)
  } catch {
    navigateAfterSignOut("/auth/sign-out")
  }
}
