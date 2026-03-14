"use client"

import { useEffect } from "react"
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

  useEffect(() => {
    if (allowExistingSession && session.data?.user) {
      router.replace(nextPath)
    }
  }, [allowExistingSession, nextPath, router, session.data?.user])

  return null
}
