"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { PostHogProvider as ReactPostHogProvider } from "posthog-js/react"

import {
  ensurePosthog,
  getTelemetryConsent,
  isPosthogEnabled,
  posthog,
  TELEMETRY_CONSENT_EVENT,
} from "@/lib/telemetry/posthog"

export function PostHogProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!isPosthogEnabled()) {
      return
    }

    function syncConsent() {
      const consent = getTelemetryConsent()

      if (consent === "accepted") {
        setReady(ensurePosthog())
        return
      }

      setReady(false)
    }

    syncConsent()

    window.addEventListener(TELEMETRY_CONSENT_EVENT, syncConsent)
    window.addEventListener("storage", syncConsent)

    return () => {
      window.removeEventListener(TELEMETRY_CONSENT_EVENT, syncConsent)
      window.removeEventListener("storage", syncConsent)
    }
  }, [])

  if (!isPosthogEnabled() || !ready) {
    return <>{children}</>
  }

  return <ReactPostHogProvider client={posthog}>{children}</ReactPostHogProvider>
}
