"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

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
  const router = useRouter()
  const session = authClient.useSession()
  const userId = session.data?.user?.id
  const hasRedirected = useRef(false)

  useEffect(() => {
    if (allowExistingSession && userId && !hasRedirected.current) {
      hasRedirected.current = true
      router.replace(nextPath)
    }
  }, [allowExistingSession, nextPath, router, userId])

  return null
}
