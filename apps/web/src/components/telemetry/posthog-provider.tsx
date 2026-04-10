"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { PostHogProvider as ReactPostHogProvider } from "posthog-js/react"

import { ensurePosthog, isPosthogEnabled, posthog } from "@/lib/telemetry/posthog"

export function PostHogProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!isPosthogEnabled()) {
      return
    }
    setReady(ensurePosthog())
  }, [])

  if (!isPosthogEnabled() || !ready) {
    return <>{children}</>
  }

  return <ReactPostHogProvider client={posthog}>{children}</ReactPostHogProvider>
}
