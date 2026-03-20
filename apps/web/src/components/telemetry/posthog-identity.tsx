"use client"

import { useEffect } from "react"

import { identifyPosthogUser, resetPosthogUser } from "@/lib/telemetry/posthog"

export function PostHogIdentity({ userId }: { userId: string | null }) {
  useEffect(() => {
    if (userId) {
      identifyPosthogUser(userId)
      return
    }

    resetPosthogUser()
  }, [userId])

  return null
}
