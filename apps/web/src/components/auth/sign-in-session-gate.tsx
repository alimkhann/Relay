"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { authClient } from "@/lib/auth/client"

export function SignInSessionGate({ nextPath }: { nextPath: string }) {
  const router = useRouter()
  const session = authClient.useSession()

  useEffect(() => {
    if (session.data?.user) {
      router.replace(nextPath)
    }
  }, [nextPath, router, session.data?.user])

  return null
}
