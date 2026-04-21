"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, Check, Loader2 } from "lucide-react"

import type { BillingStatusDto } from "@relay/shared"

import { PRICING } from "../../app/(marketing)/pricing.config"
import { FadeIn } from "@/components/ui/fade-in"
import { cn } from "@/lib/cn"
import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client"
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
  if (ratio >= 0.95) return "bg-red-500"
  if (ratio >= 0.8) return "bg-amber-500"
  return "bg-emerald-500"
}

function UsageMeter({ item }: { item: UsageItem }) {
  const ratio = item.limit > 0 ? item.used / item.limit : 0
  const pct = Math.min(ratio * 100, 100)
  const tone = getUsageTone(ratio)
  const colorClass = getUsageColor(ratio)

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13px] font-medium text-[var(--relay-ink)]">{item.label}</span>
        <span className="text-[12px] tabular-nums text-[var(--relay-muted)]">
          {item.used} / {item.limit}
          {item.periodLabel ? <span className="ml-1 text-[11px] text-[var(--relay-faint)]">{item.periodLabel}</span> : null}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--relay-line)]">
        <div
          className={cn("h-full rounded-full transition-all duration-300", colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {tone === "danger" ? (
        <div className="flex items-center gap-2 mt-2 text-red-500 bg-red-500/5 border border-red-500/20 rounded-md px-3 py-2 text-xs">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Limit reached — upgrade to continue.
        </div>
      ) : null}
      {tone === "warning" ? (
        <p className="text-[11px] font-medium text-amber-500">
          Nearly full
        </p>
      ) : null}
      {tone === "notice" ? (
        <p className="text-[11px] font-medium text-amber-500">
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
  priceNote,
  badge,
  features,
  tone = "default",
  actions,
}: {
  title: string
  subtitle: string
  price: string
  priceNote?: string
  badge?: string
  features: string[]
  tone?: "default" | "accent"
  actions?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-[var(--relay-radius)] border p-5",
        tone === "accent"
          ? "border-[var(--relay-accent)]/30 bg-[var(--relay-accent)]/[0.03] ring-1 ring-[var(--relay-accent)]/20"
          : "border-[var(--relay-line)] bg-[var(--relay-bg)]",
      )}
    >
      {badge ? (
        <span
          className={cn(
            "absolute right-4 top-4 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-widest uppercase",
            tone === "accent"
              ? "border border-[var(--relay-accent)]/20 bg-[var(--relay-accent)]/10 text-[var(--relay-accent)]"
              : "border border-[var(--relay-line)] bg-[var(--relay-surface)] text-[var(--relay-muted)]",
          )}
        >
          {badge}
        </span>
      ) : null}
      <div>
        <h3 className="text-[15px] font-semibold text-[var(--relay-ink)]">{title}</h3>
        <p className="mt-1 text-[12px] text-[var(--relay-muted)]">{subtitle}</p>
      </div>
      <div className="mt-4">
        <p className="text-[24px] font-semibold tracking-tight text-[var(--relay-ink)]">{price}</p>
        {priceNote ? <p className="mt-1 text-[11px] font-medium text-emerald-500">{priceNote}</p> : null}
      </div>
      <ul className="mt-4 space-y-2">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-[13px] text-[var(--relay-muted)]">
            <Check className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", tone === "accent" ? "text-emerald-500" : "text-[var(--relay-muted)]")} />
            {feature}
          </li>
        ))}
      </ul>
      {actions ? <div className="mt-auto pt-5 space-y-2">{actions}</div> : null}
    </div>
  )
}

const CHECKOUT_SYNC_MAX_ATTEMPTS = 10
const CHECKOUT_SYNC_INTERVAL_MS = 5_000

export function BillingSection({ billing, checkoutSuccess }: BillingSectionProps) {
  const router = useRouter()
  const { entitlements, usage } = billing
  const [yearly, setYearly] = useState(false)
  const [loading, setLoading] = useState<"month" | "year" | "portal" | "resync" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(true)
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "timed_out">(
    checkoutSuccess && !entitlements.isPro ? "syncing" : "idle",
  )
  const syncAttemptsRef = useRef(0)

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
      {
        label: "AI analyses",
        used: usage.aiAnalysesToday,
        limit: entitlements.limits.aiAnalysesPerUserDaily,
        periodLabel: "/ day",
        upgradeCopy: `unlock ${120} AI analyses per day`,
      },
    ],
    [entitlements.limits, usage],
  )

  const topUsagePressure = useMemo(() => {
    return usageItems
      .map((item) => ({ ...item, ratio: item.limit > 0 ? item.used / item.limit : 0 }))
      .sort((a, b) => b.ratio - a.ratio)[0]
  }, [usageItems])

  const anyLimitReached = useMemo(() => {
    return usageItems.some((item) => item.limit > 0 && item.used / item.limit >= 1)
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

  useEffect(() => {
    if (!anyLimitReached || entitlements.isPro) return

    logClientEvent({
      level: "warn",
      surface: "web-settings",
      area: "billing",
      event: "usage_limit_block_shown",
      message: "Rendered a blocking usage limit notice.",
      context: {
        limitName: topUsagePressure?.label ?? null,
        usageState: "blocked",
      },
    })
  }, [anyLimitReached, entitlements.isPro, topUsagePressure?.label])

  useEffect(() => {
    if (!dynamicNotice || entitlements.isPro || anyLimitReached) return

    logClientEvent({
      level: "info",
      surface: "web-settings",
      area: "billing",
      event: "usage_limit_warning_shown",
      message: "Rendered a usage limit warning notice.",
      context: {
        limitName: topUsagePressure?.label ?? null,
        usageState: topUsagePressure && topUsagePressure.ratio >= 0.85 ? "warning" : "notice",
      },
    })
  }, [anyLimitReached, dynamicNotice, entitlements.isPro, topUsagePressure])

  // If webhook already landed before we got back from checkout, no sync needed.
  useEffect(() => {
    if (entitlements.isPro && syncState === "syncing") {
      setSyncState("idle")
    }
  }, [entitlements.isPro, syncState])

  // Poll for sync completion — webhook usually lands within a couple seconds,
  // but Polar can take up to a minute on cold starts.
  useEffect(() => {
    if (syncState !== "syncing") return

    const handle = window.setInterval(() => {
      syncAttemptsRef.current += 1
      if (entitlements.isPro) {
        setSyncState("idle")
        window.clearInterval(handle)
        return
      }
      if (syncAttemptsRef.current >= CHECKOUT_SYNC_MAX_ATTEMPTS) {
        setSyncState("timed_out")
        window.clearInterval(handle)
        logClientEvent({
          level: "warn",
          surface: "web-settings",
          area: "billing",
          event: "billing_checkout_sync_timeout",
          message: "Billing state did not update within the expected window after checkout.",
          context: { attempts: syncAttemptsRef.current },
        })
        return
      }
      router.refresh()
    }, CHECKOUT_SYNC_INTERVAL_MS)

    return () => window.clearInterval(handle)
  }, [entitlements.isPro, router, syncState])

  const handleResync = useCallback(async () => {
    setLoading("resync")
    setError(null)
    try {
      const res = await relayClientFetch("/api/billing/resync", {
        method: "POST",
        telemetry: {
          surface: "web-settings",
          area: "settings-billing",
          event: "billing_resync_invoked",
          logSuccess: true,
        },
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Could not resync billing state")
      }
      syncAttemptsRef.current = 0
      setSyncState("syncing")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(null)
    }
  }, [router])

  useEffect(() => {
    if (!checkoutSuccess || !entitlements.isPro) return

    logClientEvent({
      level: "info",
      surface: "web-settings",
      area: "billing",
      event: "billing_checkout_succeeded",
      message: "Returned from a successful billing checkout.",
      context: {
        plan: entitlements.plan,
        status: entitlements.status,
        period: entitlements.interval,
      },
    })

    // Ping the extension (if installed) to invalidate its session cache so
    // entitlement-gated UI flips to Pro without waiting for the 15s TTL.
    const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID
    if (!extensionId) return
    type RuntimeChrome = {
      runtime?: {
        sendMessage?: (id: string, message: { type: string }, cb?: (response?: unknown) => void) => void
      }
    }
    const runtimeChrome = (typeof window !== "undefined"
      ? (window as unknown as { chrome?: RuntimeChrome }).chrome
      : undefined)
    if (!runtimeChrome?.runtime?.sendMessage) return
    try {
      runtimeChrome.runtime.sendMessage(extensionId, { type: "billing.refresh" }, () => {
        // Swallow chrome.runtime.lastError — the extension may not be installed.
        void 0
      })
    } catch {
      // No-op — extension not installed or sendMessage rejected.
    }
  }, [checkoutSuccess, entitlements.interval, entitlements.isPro, entitlements.plan, entitlements.status])

  async function handleCheckout(interval: "month" | "year", plan: "starter" | "pro" = "starter") {
    setLoading(interval)
    setError(null)

    try {
      const flowId = createClientFlowId("billing")
      const res = await relayClientFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, interval }),
        telemetry: {
          surface: "web-settings",
          area: "settings-billing",
          event: "upgrade_cta_clicked",
          flowId,
          context: { interval },
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
          surface: "web-settings",
          area: "settings-billing",
          event: "billing_portal_opened",
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
      {checkoutSuccess && entitlements.isPro && showSuccess ? (
        <FadeIn>
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
        </FadeIn>
      ) : null}

      {checkoutSuccess && !entitlements.isPro && syncState === "syncing" ? (
        <FadeIn>
        <section className="overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
          <div className="flex items-start gap-3 px-5 py-4">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--relay-muted)]" />
            <div>
              <p className="text-[14px] font-semibold text-[var(--relay-ink)]">Finalizing your upgrade…</p>
              <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
                Your payment succeeded. We&apos;re syncing your account — this usually takes a few seconds.
              </p>
            </div>
          </div>
        </section>
        </FadeIn>
      ) : null}

      {checkoutSuccess && !entitlements.isPro && syncState === "timed_out" ? (
        <FadeIn>
        <section className="overflow-hidden rounded-[var(--relay-radius)] border border-amber-500/20 bg-amber-500/5">
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[14px] font-semibold text-[var(--relay-ink)]">Upgrade is taking longer than usual</p>
              <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
                Your payment succeeded but we haven&apos;t received confirmation from our billing provider yet. Try resyncing — if that
                doesn&apos;t work, email{" "}
                <a href="mailto:support@onrelay.app" className="font-medium text-[var(--relay-accent)] hover:opacity-80">
                  support@onrelay.app
                </a>
                .
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleResync()}
              disabled={loading !== null}
              className="shrink-0 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[13px] font-medium text-[var(--relay-bg)] transition hover:opacity-90 disabled:opacity-50"
            >
              {loading === "resync" ? "Retrying…" : "Retry sync"}
            </button>
          </div>
        </section>
        </FadeIn>
      ) : null}

      {entitlements.status === "past_due" && entitlements.plan === "pro" ? (
        <FadeIn>
        <section className="overflow-hidden rounded-[var(--relay-radius)] border border-amber-500/20 bg-amber-500/5">
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[14px] font-semibold text-[var(--relay-ink)]">Payment issue detected</p>
              <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
                Your Pro access is still on, but billing needs attention. Update your payment method in the customer portal to avoid interruption.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handlePortal()}
              disabled={loading !== null}
              className="shrink-0 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[13px] font-medium text-[var(--relay-bg)] transition hover:opacity-90 disabled:opacity-50"
            >
              {loading === "portal" ? "Opening portal..." : "Fix billing"}
            </button>
          </div>
        </section>
        </FadeIn>
      ) : null}

      {anyLimitReached && !entitlements.isPro ? (
        <section className="border border-[var(--relay-accent)]/20 rounded-lg px-4 py-3">
          <div className="flex items-center gap-3 justify-between">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-[var(--relay-accent)]" />
              <p className="text-[13px] text-[var(--relay-ink)]">
                You&apos;ve hit a plan limit. Upgrade to unlock higher quotas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCheckout("month", "starter")}
              disabled={loading !== null}
              className="shrink-0 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[13px] font-medium text-[var(--relay-bg)] transition hover:opacity-90 disabled:opacity-50"
            >
              {loading === "month" ? "Starting..." : "Upgrade"}
            </button>
          </div>
        </section>
      ) : null}

      <FadeIn delay={0.05}>
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
          {/* Monthly / Yearly toggle */}
          {entitlements.plan !== "pro" ? (
            <div className="flex items-center justify-center gap-3 mb-5">
              <span className={cn("text-[13px] font-medium transition-colors", !yearly ? "text-[var(--relay-ink)]" : "text-[var(--relay-muted)]")}>Monthly</span>
              <button
                type="button"
                onClick={() => setYearly(!yearly)}
                className={cn(
                  "relative h-6 w-10 shrink-0 rounded-full transition-colors",
                  yearly ? "bg-emerald-500" : "bg-[var(--relay-line-strong)]",
                )}
              >
                <span className={cn(
                  "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                  yearly ? "translate-x-4" : "translate-x-0",
                )} />
              </button>
              <span className={cn("text-[13px] font-medium transition-colors", yearly ? "text-[var(--relay-ink)]" : "text-[var(--relay-muted)]")}>Yearly</span>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-3">
            <PlanCard
              title="Free"
              subtitle={PRICING.free.description}
              price="$0 / forever"
              badge={entitlements.plan === "free" ? "Current" : undefined}
              features={[...PRICING.free.features]}
              actions={
                entitlements.plan === "free" ? (
                  <p className="text-[12px] text-[var(--relay-muted)]">You&apos;re on the Free plan.</p>
                ) : entitlements.isPaid ? (
                  <button
                    type="button"
                    onClick={() => void handlePortal()}
                    disabled={loading !== null}
                    className="w-full rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-4 py-2 text-[13px] font-medium text-[var(--relay-muted)] transition hover:bg-[var(--relay-soft)] disabled:opacity-50"
                  >
                    {loading === "portal" ? "Opening portal..." : "Downgrade to Free"}
                  </button>
                ) : null
              }
            />

            <PlanCard
              title="Starter"
              subtitle={PRICING.starter.description}
              price={yearly ? `$${Math.round(PRICING.starter.yearlyPrice / 12)}/mo` : `$${PRICING.starter.monthlyPrice}/mo`}
              priceNote={yearly ? "Billed $120/yr · -17%" : undefined}
              badge={entitlements.plan === "starter" ? "Current" : undefined}
              features={[...PRICING.starter.features]}
              actions={
                entitlements.plan === "starter" ? (
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
                      {entitlements.currentPeriodEnd
                        ? `Renews ${new Date(entitlements.currentPeriodEnd).toLocaleDateString()}. Cancel anytime.`
                        : "Cancel anytime from the customer portal."}
                    </p>
                  </div>
                ) : entitlements.plan === "pro" ? (
                  <button
                    type="button"
                    onClick={() => void handlePortal()}
                    disabled={loading !== null}
                    className="w-full rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-4 py-2 text-[13px] font-medium text-[var(--relay-muted)] transition hover:bg-[var(--relay-soft)] disabled:opacity-50"
                  >
                    {loading === "portal" ? "Opening portal..." : "Downgrade to Starter"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleCheckout(yearly ? "year" : "month", "starter")}
                    disabled={loading !== null}
                    className="w-full rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[13px] font-medium text-[var(--relay-bg)] transition hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? "Starting..." : "Get Starter"}
                  </button>
                )
              }
            />

            <PlanCard
              title="Pro"
              subtitle={entitlements.isTrialing ? "Trialing now" : PRICING.pro.description}
              price={yearly ? `$${Math.round(PRICING.pro.yearlyPrice / 12)}/mo` : `$${PRICING.pro.monthlyPrice}/mo`}
              priceNote={yearly ? "Billed $180/yr · -17%" : undefined}
              badge={entitlements.plan === "pro" ? "Current" : undefined}
              tone="accent"
              features={[...PRICING.pro.features]}
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
                ) : entitlements.plan === "starter" ? (
                  <button
                    type="button"
                    onClick={() => void handlePortal()}
                    disabled={loading !== null}
                    className="w-full rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[13px] font-medium text-[var(--relay-bg)] transition hover:opacity-90 disabled:opacity-50"
                  >
                    {loading === "portal" ? "Opening portal..." : "Upgrade to Pro"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleCheckout(yearly ? "year" : "month", "pro")}
                    disabled={loading !== null}
                    className="w-full rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[13px] font-medium text-[var(--relay-bg)] transition hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? "Starting..." : "Get Pro"}
                  </button>
                )
              }
            />
          </div>

          {error ? <p className="mt-3 text-[12px] font-medium text-[var(--relay-danger)]">{error}</p> : null}
        </div>
      </section>
      </FadeIn>

      <FadeIn delay={0.1}>
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
                onClick={() => void handleCheckout("month", "starter")}
                disabled={loading !== null}
                className="shrink-0 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-4 py-2 text-[13px] font-medium text-[var(--relay-bg)] transition hover:opacity-90 disabled:opacity-50"
              >
                {loading === "month" ? "Starting..." : "Upgrade"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
      </FadeIn>
    </div>
  )
}
