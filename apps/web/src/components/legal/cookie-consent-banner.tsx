"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  getTelemetryConsent,
  isPosthogEnabled,
  setTelemetryConsent,
  type TelemetryConsent,
} from "@/lib/telemetry/posthog"

export function CookieConsentBanner() {
  const [consent, setConsent] = useState<TelemetryConsent>("unknown")

  useEffect(() => {
    if (!isPosthogEnabled()) {
      return
    }

    setConsent(getTelemetryConsent())
  }, [])

  if (!isPosthogEnabled() || consent !== "unknown") {
    return null
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] px-4 pb-4 sm:px-6 sm:pb-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-[20px] border border-[var(--relay-line-strong)] bg-[var(--relay-surface)]/96 p-4 shadow-[var(--relay-shadow-lg)] backdrop-blur sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-[var(--relay-ink)]">Minimal cookies</p>
          <p className="mt-1 text-sm leading-6 text-[var(--relay-muted)]">
            Relay uses optional PostHog cookies and local storage for analytics and client-side error tracking. Accept to help improve the app, or decline to keep browsing without PostHog cookies.
            <span className="ml-1">
              <Link href="/privacy" className="text-[var(--relay-ink)] underline underline-offset-2">
                Privacy policy
              </Link>
            </span>
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setTelemetryConsent("declined")
              setConsent("declined")
            }}
          >
            Decline
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setTelemetryConsent("accepted")
              setConsent("accepted")
            }}
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  )
}
