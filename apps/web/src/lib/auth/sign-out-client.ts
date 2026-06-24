"use client"

import { clearRelayQueryCache } from "@/lib/query/clear-cache"

interface SignOutPayload {
  redirectTo?: unknown
  googleLogoutUrl?: unknown
}

export function openGoogleLogoutWindow() {
  const width = 520
  const height = 640
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)

  const popup = window.open(
    "about:blank",
    "relay-google-sign-out",
    `popup,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`,
  )

  try {
    popup?.document.write("<!doctype html><title>Signing out</title><p>Signing out...</p>")
  } catch {
    // The popup may already be cross-origin or blocked. The sign-out still succeeds.
  }

  return popup
}

function navigateAfterSignOut(redirectTo: string) {
  window.location.assign(redirectTo)
}

export function finishGoogleLogoutInBrowser(
  googleLogoutUrl: string | undefined,
  googleLogoutWindow: Window | null,
  redirectTo: string,
) {
  if (googleLogoutUrl) {
    if (googleLogoutWindow && !googleLogoutWindow.closed) {
      googleLogoutWindow.location.href = googleLogoutUrl
      window.setTimeout(() => {
        googleLogoutWindow.close()
        navigateAfterSignOut(redirectTo)
      }, 1200)
      return
    }

    const image = new Image()
    image.referrerPolicy = "no-referrer"
    image.src = googleLogoutUrl
  } else {
    googleLogoutWindow?.close()
  }

  navigateAfterSignOut(redirectTo)
}

export async function signOutFromBrowser() {
  const googleLogoutWindow = openGoogleLogoutWindow()

  try {
    await clearRelayQueryCache()

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
    finishGoogleLogoutInBrowser(
      typeof payload.googleLogoutUrl === "string" ? payload.googleLogoutUrl : undefined,
      googleLogoutWindow,
      redirectTo,
    )
  } catch {
    googleLogoutWindow?.close()
    navigateAfterSignOut("/auth/sign-out")
  }
}
