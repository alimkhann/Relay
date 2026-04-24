"use client"

import { useEffect } from "react"

import { identifyPosthogUser, resetPosthogUser } from "@/lib/telemetry/posthog"

export function PostHogIdentity({
  userId,
  name,
  email,
  plan,
  createdAt,
  isExtensionInstalled,
}: {
  userId: string | null
  name?: string | null
  email?: string | null
  plan?: string | null
  createdAt?: string | null
  isExtensionInstalled?: boolean | null
}) {
  useEffect(() => {
    if (userId) {
      identifyPosthogUser(userId, {
        name: name ?? null,
        email: email ?? null,
        plan: plan ?? null,
        created_at: createdAt ?? null,
        is_extension_installed: isExtensionInstalled ?? null,
      })
      return
    }

    resetPosthogUser()
  }, [createdAt, email, isExtensionInstalled, name, plan, userId])

  return null
}
