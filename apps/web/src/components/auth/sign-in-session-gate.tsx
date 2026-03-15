"use client"

import { useEffect } from "react"

import { authClient } from "@/lib/auth/client"

const REDIRECT_ATTEMPTED_KEY = "relay:sign-in-gate-attempted"

export function SignInSessionGate({
  nextPath,
  allowExistingSession = true,
  provider = "neon",
}: {
  nextPath: string
  allowExistingSession?: boolean
  provider?: "neon" | "local"
}) {
  if (provider === "local") {
    return null
  }

  return (
    <NeonSignInSessionGate
      nextPath={nextPath}
      allowExistingSession={allowExistingSession}
    />
  )
}

function NeonSignInSessionGate({
  nextPath,
  allowExistingSession = true,
}: {
  nextPath: string
  allowExistingSession?: boolean
}) {
  const session = authClient.useSession()
  const userId = session.data?.user?.id
  const isPending = session.isPending

  useEffect(() => {
    if (isPending || !allowExistingSession || !userId) {
      return
    }

    const alreadyAttempted = sessionStorage.getItem(REDIRECT_ATTEMPTED_KEY)
    if (alreadyAttempted) {
      return
    }

    sessionStorage.setItem(REDIRECT_ATTEMPTED_KEY, "1")
    window.location.replace(nextPath)
  }, [allowExistingSession, isPending, nextPath, userId])

  return null
}
