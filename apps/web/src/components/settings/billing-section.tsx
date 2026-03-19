"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import type { BillingStatusDto } from "@relay/shared"

import { cn } from "@/lib/cn"
import { createClientFlowId } from "@/lib/telemetry/client"
import { relayClientFetch } from "@/lib/telemetry/fetch"

interface BillingSectionProps {
  billing: BillingStatusDto
  checkoutSuccess?: boolean
}

interface UsageItem {
  label: string
  used: number
  limit: number
  periodLabel: string
  upgradeCopy: string
}

function getUsageTone(ratio: number) {
  if (ratio >= 1) return "danger"
  if (ratio >= 0.85) return "warning"
  if (ratio >= 0.7) return "notice"
  return "default"
}

function getUsageColor(ratio: number) {
  const tone = getUsageTone(ratio)
  if (tone === "danger") return "var(--relay-danger)"
  if (tone === "warning" || tone === "notice") return "var(--relay-warning, #f59e0b)"
  return "var(--relay-accent)"
}

function UsageMeter({ item }: { item: UsageItem }) {
  const ratio = item.limit > 0 ? item.used / item.limit : 0
  const pct = Math.min(ratio * 100, 100)
  const tone = getUsageTone(ratio)
  const color = getUsageColor(ratio)

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13px] font-medium text-[var(--relay-ink)]">{item.label}</span>
        <span className="text-[12px] tabular-nums text-[var(--relay-muted)]">
          {item.used} / {item.limit}
          {item.periodLabel ? <span className="ml-1 text-[11px] text-[var(--relay-faint)]">{item.periodLabel}</span> : null}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--relay-line)]">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {tone === "danger" ? (
        <p className="text-[11px] font-medium" style={{ color }}>
          Limit reached
        </p>
      ) : null}
      {tone === "warning" ? (
        <p className="text-[11px] font-medium" style={{ color }}>
          Nearly full
        </p>
      ) : null}
      {tone === "notice" ? (
        <p className="text-[11px] font-medium" style={{ color }}>
          Approaching limit
        </p>
      ) : null}
    </div>
  )
}

function PlanCard({
  title,
  subtitle,
  price,
  badge,
  features,
  tone = "default",
  actions,
}: {
  title: string
  subtitle: string
  price: string
  badge?: string
  features: string[]
  tone?: "default" | "accent"
  actions?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "relative rounded-[var(--relay-radius)] border p-4",
        tone === "accent"
          ? "border-[var(--relay-accent)]/30 bg-[var(--relay-accent)]/[0.03]"
          : "border-[var(--relay-line)] bg-[var(--relay-bg)]",
      )}
    >
      {badge ? (
        <span className="absolute right-4 top-4 rounded-full border border-[var(--relay-line)] bg-[var(--relay-surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--relay-muted)]">
          {badge}
        </span>
      ) : null}
      <div>
        <h3 className="text-[15px] font-semibold text-[var(--relay-ink)]">{title}</h3>
        <p className="mt-1 text-[12px] text-[var(--relay-muted)]">{subtitle}</p>
      </div>
      <p className="mt-4 text-[24px] font-semibold tracking-tight text-[var(--relay-ink)]">{price}</p>
      <ul className="mt-4 space-y-2">
        {features.map((feature) => (
          <li key={feature} className="text-[13px] text-[var(--relay-muted)]">
            {feature}
          </li>
        ))}
      </ul>
      {actions ? <div className="mt-5 space-y-2">{actions}</div> : null}
    </div>
  )
}

export function BillingSection({ billing, checkoutSuccess }: BillingSectionProps) {
  const { entitlements, usage } = billing
  const [loading, setLoading] = useState<"month" | "year" | "portal" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(true)

  const usageItems = useMemo<UsageItem[]>(
    () => [
      {
        label: "Active projects",
        used: usage.activeProjects,
        limit: entitlements.limits.activeProjects,
        periodLabel: "active",
        upgradeCopy: `unlock ${10} active projects`,
      },
      {
        label: "Captures",
        used: usage.capturesThisMonth,
        limit: entitlements.limits.captureMonthly,
        periodLabel: "/ month",
        upgradeCopy: `unlock ${2000} captures per month`,
      },
      {
        label: "MCP reads",
        used: usage.mcpReadsToday,
        limit: entitlements.limits.mcpReadDaily,
        periodLabel: "/ day",
        upgradeCopy: `unlock ${200} MCP reads per day`,
      },
      {
        label: "MCP writes",
        used: usage.mcpWritesToday,
        limit: entitlements.limits.mcpWriteDaily,
        periodLabel: "/ day",
        upgradeCopy: `unlock ${50} MCP writes per day`,
      },
    ],
    [entitlements.limits, usage],
  )

  const topUsagePressure = useMemo(() => {
    return usageItems
      .map((item) => ({ ...item, ratio: item.limit > 0 ? item.used / item.limit : 0 }))
      .sort((a, b) => b.ratio - a.ratio)[0]
  }, [usageItems])

  const dynamicNotice = useMemo(() => {
    if (!topUsagePressure || entitlements.isPro || topUsagePressure.ratio < 0.7) {
      return null
    }

    if (topUsagePressure.ratio >= 1) {
      return `You've reached your ${topUsagePressure.label.toLowerCase()} limit. Upgrade to ${topUsagePressure.upgradeCopy}.`
    }

    if (topUsagePressure.ratio >= 0.85) {
      return `You're close to your ${topUsagePressure.label.toLowerCase()} limit. Upgrade to ${topUsagePressure.upgradeCopy}.`
    }

    return `You're approaching your ${topUsagePressure.label.toLowerCase()} limit. Upgrade to ${topUsagePressure.upgradeCopy}.`
  }, [entitlements.isPro, topUsagePressure])

  async function handleCheckout(interval: "month" | "year") {
    setLoading(interval)
    setError(null)

    try {
      const flowId = createClientFlowId("billing")
      const res = await relayClientFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interval }),
        telemetry: {
          surface: "web-dashboard",
          area: "settings-billing",
          event: "billing.checkout",
          flowId,
          logSuccess: true,
        },
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Checkout failed")
      }

      const data = (await res.json()) as { checkoutUrl: string }
      window.location.href = data.checkoutUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setLoading(null)
    }
  }

  async function handlePortal() {
    setLoading("portal")
    setError(null)

    try {
      const flowId = createClientFlowId("billing")
      const res = await relayClientFetch("/api/billing/portal", {
        method: "POST",
        telemetry: {
          surface: "web-dashboard",
          area: "settings-billing",
          event: "billing.portal",
          flowId,
          logSuccess: true,
        },
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Could not open billing portal")
      }

      const data = (await res.json()) as { portalUrl: string }
      window.location.href = data.portalUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      {checkoutSuccess && showSuccess ? (
        <section className="overflow-hidden rounded-[var(--relay-radius)] border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-start justify-between gap-3 px-5 py-4">
            <div>
              <p className="text-[14px] font-semibold text-[var(--relay-ink)]">Relay Pro is active</p>
              <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
                Billing updated successfully. You can manage or cancel anytime from the customer portal.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSuccess(false)}
              className="text-[18px] leading-none text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)]"
              aria-label="Dismiss success message"
            >
              &times;
            </button>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Billing &amp; plan</h2>
              <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
                Compare plans, switch billing, and manage your subscription.
              </p>
            </div>
            <Link
              href="/docs/plans"
              className="text-[12px] font-medium text-[var(--relay-accent)] transition hover:opacity-80"
            >
              Compare all limits
            </Link>
          </div>
        </div>

        <div className="border-t border-[var(--relay-line)] px-5 py-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <PlanCard
              title="Free"
              subtitle="No card required"
              price="$0"
              badge={entitlements.plan === "free" ? "Current plan" : undefined}
              features={[
                "2 active projects",
                "30-day history retention",
                "Browser capture",
                "MCP read + limited write",
              ]}
              actions={
                entitlements.plan === "free" ? (
                  <p className="text-[12px] text-[var(--relay-muted)]">You&apos;re on Free right now.</p>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => void handlePortal()}
                      disabled={loading !== null}
                      className="w-full rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-4 py-2 text-[13px] font-medium text-[var(--relay-ink)] transition hover:bg-[var(--relay-soft)] disabled:opacity-50"
                    >
                      {loading === "portal" ? "Opening portal..." : "Manage in portal"}
                    </button>
                    <p className="text-[12px] text-[var(--relay-muted)]">Use the customer portal to cancel or change your subscription.</p>
                  </div>
                )
              }
            />

            <PlanCard
              title="Pro"
              subtitle={entitlements.isTrialing ? "Trialing now" : "For daily AI workflows"}
              price="$9/mo or $90/yr"
              badge={entitlements.plan === "pro" ? "Current plan" : "7-day trial"}
              tone="accent"
              features={[
                "10 active projects",
                "365-day history retention",
                "2,000 captures per month",
                "200 MCP reads and 50 writes per day",
                "Handoff packs",
              ]}
              actions={
                entitlements.plan === "pro" ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => void handlePortal()}
                      disabled={loading !== null}
                      className="w-full rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[13px] font-medium text-[var(--relay-bg)] transition hover:opacity-90 disabled:opacity-50"
                    >
                      {loading === "portal" ? "Opening portal..." : "Manage subscription"}
                    </button>
                    <p className="text-[12px] text-[var(--relay-muted)]">
                      {entitlements.isTrialing && entitlements.trialEndsAt
                        ? `Trial ends ${new Date(entitlements.trialEndsAt).toLocaleDateString()}. Cancel anytime.`
                        : entitlements.currentPeriodEnd
                          ? `Renews ${new Date(entitlements.currentPeriodEnd).toLocaleDateString()}. Cancel anytime.`
                          : "Cancel anytime from the customer portal."}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void handleCheckout("month")}
                      disabled={loading !== null}
                      className="rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[13px] font-medium text-[var(--relay-bg)] transition hover:opacity-90 disabled:opacity-50"
                    >
                      {loading === "month" ? "Starting..." : "Choose monthly"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCheckout("year")}
                      disabled={loading !== null}
                      className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-surface)] px-4 py-2 text-[13px] font-medium text-[var(--relay-ink)] transition hover:bg-[var(--relay-soft)] disabled:opacity-50"
                    >
                      {loading === "year" ? "Starting..." : "Choose yearly"}
                    </button>
                    <p className="sm:col-span-2 text-[12px] text-[var(--relay-muted)]">7-day trial included. Cancel anytime.</p>
                  </div>
                )
              }
            />
          </div>

          {error ? <p className="mt-3 text-[12px] font-medium text-[var(--relay-danger)]">{error}</p> : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Usage</h2>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">Track plan limits for the current period.</p>
        </div>

        <div className="border-t border-[var(--relay-line)] px-5 py-5 space-y-4">
          {usageItems.map((item) => (
            <UsageMeter key={item.label} item={item} />
          ))}
        </div>

        {dynamicNotice ? (
          <div className="border-t border-[var(--relay-line)] bg-[var(--relay-accent)]/[0.03] px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] text-[var(--relay-muted)]">{dynamicNotice}</p>
              <button
                type="button"
                onClick={() => void handleCheckout("month")}
                disabled={loading !== null}
                className="shrink-0 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[13px] font-medium text-[var(--relay-bg)] transition hover:opacity-90 disabled:opacity-50"
              >
                {loading === "month" ? "Starting..." : "Upgrade to Pro"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
