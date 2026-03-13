"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { authClient } from "@/lib/auth/client"

export function SignInSessionGate({
  nextPath,
  allowExistingSession = true
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
