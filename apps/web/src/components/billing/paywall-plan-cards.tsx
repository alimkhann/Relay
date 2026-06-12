"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, Check } from "lucide-react"

import { PRICING } from "@/app/(marketing)/pricing.config"
import { BillingIntervalToggle } from "@/components/billing/billing-interval-toggle"
import { cn } from "@/lib/cn"
import { relayClientFetch } from "@/lib/telemetry/fetch"
import { logClientEvent } from "@/lib/telemetry/client"

type PaidPlan = "starter" | "pro"
type Interval = "month" | "year"

const CONTINUE_FREE_DELAY_SEC = 5

/**
 * Shared paywall: monthly/annual toggle on top, the two PAID plan cards styled
 * after the marketing pricing cards, and a deliberately low-emphasis
 * "continue with free" link below — Get Starter / Get Pro are the primary
 * continue actions. Used by the onboarding walkthrough and the soft paywall.
 */
export function PaywallPlanCards({
  source,
  onContinueFree,
  onBack,
  footerLayout = false,
  variant = "soft_paywall",
}: {
  source: "walkthrough" | "soft_paywall"
  onContinueFree: () => void
  onBack?: () => void
  /** When true, back + continue-free share one footer row (onboarding plan step). */
  footerLayout?: boolean
  variant?: "walkthrough" | "soft_paywall"
}) {
  const [interval, setInterval] = useState<Interval>("year")
  const [loading, setLoading] = useState<PaidPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [freeDelay, setFreeDelay] = useState(CONTINUE_FREE_DELAY_SEC)

  const flat = variant === "walkthrough"

  useEffect(() => {
    logClientEvent({
      level: "info",
      surface: "web-dashboard",
      area: "billing",
      event: "paywall_viewed",
      message: "Paywall plan cards shown.",
      context: { source, paywall_reason: source },
    })
  }, [source])

  useEffect(() => {
    if (freeDelay <= 0) return
    const timer = window.setInterval(() => {
      setFreeDelay((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [freeDelay])

  const yearly = interval === "year"
  const freeReady = freeDelay === 0

  async function checkout(plan: PaidPlan) {
    setLoading(plan)
    setError(null)
    try {
      const response = await relayClientFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan,
          interval,
          ...(source === "walkthrough" ? { source: "walkthrough" } : {}),
        }),
        telemetry: {
          surface: "web-dashboard",
          area: "billing",
          event: source === "walkthrough" ? "walkthrough_plan_cta_clicked" : "soft_paywall_cta_clicked",
          context: { plan, interval },
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

  function PlanCard({ plan, featured }: { plan: typeof PRICING.starter | typeof PRICING.pro; featured: boolean }) {
    const key: PaidPlan = plan.name === "Starter" ? "starter" : "pro"
    const price = yearly ? Math.round(plan.yearlyPrice / 12) : plan.monthlyPrice
    return (
      <div
        className={cn(
          "relative flex flex-col",
          flat
            ? "rounded-xl bg-[var(--relay-soft)]/40 p-4"
            : cn(
                "rounded-2xl border p-5",
                featured
                  ? "border-[var(--relay-accent)]/35 bg-[var(--relay-accent)]/[0.04]"
                  : "border-[var(--relay-line)] bg-[var(--relay-bg)]",
              ),
        )}
      >
        {"badge" in plan && plan.badge ? (
          <span className="absolute right-3 top-3 rounded-full bg-[var(--relay-accent)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--relay-accent-text)]">
            {plan.badge}
          </span>
        ) : null}
        <h3 className="text-base font-semibold text-[var(--relay-ink)]">{plan.name}</h3>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-semibold tracking-tight text-[var(--relay-ink)]">${price}</span>
          <span className="text-xs text-[var(--relay-muted)]">/ month</span>
          {yearly ? <span className="ml-1 text-[11px] font-medium text-emerald-500">-17%</span> : null}
        </div>
        {yearly ? (
          <p className="mt-0.5 text-[11px] text-[var(--relay-muted)]">Billed ${plan.yearlyPrice} / year</p>
        ) : null}
        <p className="mt-1.5 text-xs text-[var(--relay-muted)]">{plan.description}</p>
        <ul className="mt-4 flex-1 space-y-2">
          {plan.features.slice(0, 5).map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Check size={13} className="mt-0.5 shrink-0 text-[var(--relay-muted)]" strokeWidth={2} />
              <span className="text-xs text-[var(--relay-ink-secondary)]">{feature}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => void checkout(key)}
          className={cn(
            "mt-5 inline-flex w-full items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50",
            "bg-[var(--relay-accent)] text-[var(--relay-accent-text)]",
          )}
        >
          {loading === key ? "Opening…" : `Get ${plan.name}`}
        </button>
      </div>
    )
  }

  const continueFreeButton = (
    <button
      type="button"
      disabled={!freeReady}
      onClick={onContinueFree}
      className={cn(
        footerLayout ? "flex-1" : "w-full",
        "rounded-full border px-5 py-2.5 text-sm transition-colors",
        freeReady
          ? "border-[var(--relay-line)] text-[var(--relay-muted)] hover:border-[var(--relay-line-strong)] hover:text-[var(--relay-ink)]"
          : "cursor-not-allowed border-[var(--relay-line)]/60 text-[var(--relay-faint)] opacity-50",
      )}
    >
      {freeReady ? "Continue with the free plan" : `Continue with the free plan (${freeDelay}s)`}
    </button>
  )

  return (
    <div className={cn("mx-auto w-full", flat ? "max-w-xl" : "max-w-2xl")}>
      <BillingIntervalToggle
        className="mb-5"
        interval={interval}
        onChange={setInterval}
        onToggle={(next) => {
          logClientEvent({
            level: "info",
            surface: "web-dashboard",
            area: "billing",
            event: "pricing_interval_toggled",
            message: "Toggled paywall billing interval.",
            context: { source, interval: next },
          })
        }}
      />

      <div className={cn("grid gap-3 sm:grid-cols-2", flat && "gap-4")}>
        <PlanCard plan={PRICING.starter} featured />
        <PlanCard plan={PRICING.pro} featured={false} />
      </div>

      {error ? <p className="mt-3 text-xs font-medium text-[var(--relay-danger)]">{error}</p> : null}

      {footerLayout && onBack ? (
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--relay-line)] text-[var(--relay-muted)] transition-colors hover:border-[var(--relay-line-strong)] hover:text-[var(--relay-ink)]"
          >
            <ArrowLeft size={16} />
          </button>
          {continueFreeButton}
        </div>
      ) : (
        <>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mb-4 text-sm text-[var(--relay-muted)] transition-colors hover:text-[var(--relay-ink)]"
            >
              Back
            </button>
          ) : null}
          <div className="mt-5">{continueFreeButton}</div>
        </>
      )}
    </div>
  )
}