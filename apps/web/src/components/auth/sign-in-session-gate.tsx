"use client"

import { useEffect, useRef } from "react"

import { authClient } from "@/lib/auth/client"

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
  const hasRedirected = useRef(false)

  useEffect(() => {
    if (!isPending && allowExistingSession && userId && !hasRedirected.current) {
      hasRedirected.current = true
      window.location.replace(nextPath)
    }
  }, [allowExistingSession, isPending, nextPath, userId])

  return null
}
