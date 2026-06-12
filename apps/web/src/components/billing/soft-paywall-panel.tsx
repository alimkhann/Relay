"use client"

import { useState } from "react"

import { PaywallPlanCards } from "@/components/billing/paywall-plan-cards"

const STORAGE_KEY = "relay.softPaywall.dismissed"

export function SoftPaywallPanel() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem(STORAGE_KEY) === "true"
  })

  if (dismissed) return null

  function continueFree() {
    window.localStorage.setItem(STORAGE_KEY, "true")
    setDismissed(true)
  }

  return (
    <section className="mb-6 overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
      <div className="px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Choose your plan</h2>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
          Keep long-term memory, briefs, and the Relay agent running once Relay is part of your workflow.
        </p>
      </div>
      <div className="border-t border-[var(--relay-line)] p-5">
        <PaywallPlanCards source="soft_paywall" onContinueFree={continueFree} />
      </div>
    </section>
  )
}
