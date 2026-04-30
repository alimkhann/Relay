"use client"

import { useState, useEffect } from "react"
import { Gift, X } from "lucide-react"

const STORAGE_KEY = "relay:referral-welcome-dismissed"

export function ReferralWelcomeBanner() {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1")
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1")
    setDismissed(true)
  }

  if (dismissed) return null

  return (
    <div className="relative mb-6 overflow-hidden rounded-[var(--relay-radius)] border border-emerald-500/20 bg-emerald-500/5">
      <div className="px-5 py-4">
        <button
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-[var(--relay-radius-sm)] p-1 text-[var(--relay-faint)] transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
            <Gift className="h-4 w-4 text-emerald-500" />
          </span>
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--relay-ink)]">
              You were referred — welcome!
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--relay-muted)]">
              You'll get <span className="font-medium text-emerald-600 dark:text-emerald-400">20% off your first paid month</span> or{" "}
              <span className="font-medium text-emerald-600 dark:text-emerald-400">10% off your first annual plan</span> when you upgrade.
              The discount applies automatically at checkout.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
