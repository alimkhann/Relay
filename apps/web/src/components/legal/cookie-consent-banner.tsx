"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  getTelemetryConsent,
  isPosthogEnabled,
  setTelemetryConsent,
  type TelemetryConsent,
} from "@/lib/telemetry/posthog"

export function CookieConsentBanner() {
  const [consent, setConsent] = useState<TelemetryConsent>("unknown")
  const [isExpanded, setIsExpanded] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isPosthogEnabled()) {
      return
    }

    setConsent(getTelemetryConsent())
  }, [])

  useEffect(() => {
    if (!isExpanded) return

    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setIsExpanded(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isExpanded])

  if (!isPosthogEnabled() || consent !== "unknown") {
    return null
  }

  return (
    <div
      ref={cardRef}
      className="fixed bottom-5 right-5 z-[90]"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {!isExpanded ? (
        <button
          type="button"
          aria-label="Cookie preferences"
          onClick={() => setIsExpanded(true)}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--relay-line-strong)] bg-[var(--relay-surface)] text-xl shadow-[var(--relay-shadow-lg)] transition-transform duration-200 hover:scale-110 active:scale-95"
        >
          🍪
        </button>
      ) : (
        <div className="w-[264px] origin-bottom-right animate-[cookie-expand_200ms_ease-out] rounded-2xl border border-[var(--relay-line-strong)] bg-[var(--relay-surface)] p-4 shadow-[var(--relay-shadow-lg)]">
          <p className="text-sm font-semibold text-[var(--relay-ink)]">
            🍪 Minimal cookies
          </p>
          <p className="mt-1.5 text-xs leading-5 text-[var(--relay-muted)]">
            Optional analytics &amp; error tracking to improve Relay.{" "}
            <Link
              href="/privacy"
              className="text-[var(--relay-ink)] underline underline-offset-2"
            >
              Privacy
            </Link>
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => {
                setTelemetryConsent("declined")
                setConsent("declined")
              }}
            >
              Decline
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => {
                setTelemetryConsent("accepted")
                setConsent("accepted")
              }}
            >
              Accept
            </Button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes cookie-expand {
          from {
            opacity: 0;
            transform: scale(0.85);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  )
}
