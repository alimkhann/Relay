"use client"

import type { ReactNode } from "react"
import { PostHogProvider as ReactPostHogProvider } from "posthog-js/react"

import { ensurePosthog, isPosthogEnabled, posthog } from "@/lib/telemetry/posthog"

export function PostHogProvider({ children }: { children: ReactNode }) {
  if (!isPosthogEnabled()) {
    return <>{children}</>
  }

  ensurePosthog()

  return <ReactPostHogProvider client={posthog}>{children}</ReactPostHogProvider>
}
