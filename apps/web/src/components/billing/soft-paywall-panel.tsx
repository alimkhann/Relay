"use client"

import { useState } from "react"

import { PRICING } from "@/app/(marketing)/pricing.config"
import { Button } from "@/components/ui/button"
import { relayClientFetch } from "@/lib/telemetry/fetch"

const STORAGE_KEY = "relay.softPaywall.dismissed"

export function SoftPaywallPanel() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem(STORAGE_KEY) === "true"
  })
  const [loading, setLoading] = useState<"starter" | "pro" | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (dismissed) return null

  function continueFree() {
    window.localStorage.setItem(STORAGE_KEY, "true")
    setDismissed(true)
  }

  async function checkout(plan: "starter" | "pro") {
    setLoading(plan)
    setError(null)
    try {
      const response = await relayClientFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, interval: "month" }),
        telemetry: {
          surface: "web-dashboard",
          area: "billing",
          event: "soft_paywall_cta_clicked",
          context: { plan, interval: "month" },
          logSuccess: true,
        },
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? "Checkout failed.")
      }
      const payload = (await response.json()) as { checkoutUrl: string }
      window.location.href = payload.checkoutUrl
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout failed.")
      setLoading(null)
    }
  }

  return (
    <section className="mb-6 overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
      <div className="px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Choose your plan</h2>
        <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
          Stay free, or continue with higher limits once Relay is part of your workflow.
        </p>
      </div>
      <div className="grid gap-3 border-t border-[var(--relay-line)] p-5 md:grid-cols-3">
        <div className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] p-4">
          <h3 className="text-sm font-semibold text-[var(--relay-ink)]">Free</h3>
          <p className="mt-1 text-xs text-[var(--relay-muted)]">{PRICING.free.description}</p>
          <Button className="mt-4 w-full" variant="secondary" onClick={continueFree}>
            Continue Free
          </Button>
        </div>
        <div className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] p-4">
          <h3 className="text-sm font-semibold text-[var(--relay-ink)]">Starter</h3>
          <p className="mt-1 text-xs text-[var(--relay-muted)]">${PRICING.starter.monthlyPrice}/mo · {PRICING.starter.description}</p>
          <Button className="mt-4 w-full" disabled={loading !== null} onClick={() => void checkout("starter")}>
            {loading === "starter" ? "Opening..." : "Continue with Starter"}
          </Button>
        </div>
        <div className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-accent)]/30 bg-[var(--relay-accent)]/[0.03] p-4">
          <h3 className="text-sm font-semibold text-[var(--relay-ink)]">Pro</h3>
          <p className="mt-1 text-xs text-[var(--relay-muted)]">${PRICING.pro.monthlyPrice}/mo · {PRICING.pro.description}</p>
          <Button className="mt-4 w-full" disabled={loading !== null} onClick={() => void checkout("pro")}>
            {loading === "pro" ? "Opening..." : "Continue with Pro"}
          </Button>
        </div>
      </div>
      {error ? <p className="px-5 pb-4 text-xs font-medium text-[var(--relay-danger)]">{error}</p> : null}
    </section>
  )
}
