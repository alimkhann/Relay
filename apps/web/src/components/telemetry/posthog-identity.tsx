"use client"

import { useEffect } from "react"

import { identifyPosthogUser, resetPosthogUser } from "@/lib/telemetry/posthog"

export function PostHogIdentity({
  userId,
  name,
  email,
  plan,
  createdAt,
  signupSource,
  isExtensionInstalled,
  isEmployee,
  isTestUser,
}: {
  userId: string | null
  name?: string | null
  email?: string | null
  plan?: string | null
  createdAt?: string | null
  signupSource?: string | null
  isExtensionInstalled?: boolean | null
  isEmployee?: boolean | null
  isTestUser?: boolean | null
}) {
  useEffect(() => {
    if (userId) {
      identifyPosthogUser(userId, {
        name: name ?? null,
        email: email ?? null,
        plan: plan ?? null,
        created_at: createdAt ?? null,
        signup_source: signupSource ?? null,
        is_extension_installed: isExtensionInstalled ?? null,
        is_employee: isEmployee ?? null,
        is_test_user: isTestUser ?? null,
      })
      return
    }

    resetPosthogUser()
  }, [createdAt, email, isEmployee, isExtensionInstalled, isTestUser, name, plan, signupSource, userId])

  return null
}
