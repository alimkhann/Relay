"use client"

import { useState } from "react"
import type { BillingStatusDto } from "@relay/shared"
import { cn } from "@/lib/cn"
import { createClientFlowId } from "@/lib/telemetry/client"
import { relayClientFetch } from "@/lib/telemetry/fetch"

/* ───────────────────────────────── types ─── */

interface BillingSectionProps {
  billing: BillingStatusDto
  checkoutSuccess?: boolean
}

/* ───────────────────────── usage meter ─── */

function UsageMeter({
  label,
  used,
  limit,
  period,
}: {
  label: string
  used: number
  limit: number
  period: string
}) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0
  const color =
    pct >= 100
      ? "var(--relay-danger)"
      : pct >= 85
        ? "var(--relay-warning, #f59e0b)"
        : pct >= 70
          ? "var(--relay-warning, #f59e0b)"
          : "var(--relay-accent)"
  const opacity = pct >= 85 ? 1 : pct >= 70 ? 0.7 : 1

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-[var(--relay-ink)]">{label}</span>
        <span className="text-[12px] tabular-nums text-[var(--relay-muted)]">
          {used} / {limit}
          <span className="ml-1 text-[11px] text-[var(--relay-faint)]">{period}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--relay-line)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            opacity,
          }}
        />
      </div>
      {pct >= 85 && pct < 100 && (
        <p className="text-[11px] font-medium" style={{ color }}>
          Approaching limit
        </p>
      )}
      {pct >= 100 && (
        <p className="text-[11px] font-medium" style={{ color }}>
          Limit reached
        </p>
      )}
    </div>
  )
}

/* ───────────────────────── main section ─── */

export function BillingSection({ billing, checkoutSuccess }: BillingSectionProps) {
  const { entitlements, usage } = billing
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successDismissed, setSuccessDismissed] = useState(false)

  const isPro = entitlements.isPro
  const isTrialing = entitlements.isTrialing
  const planLabel = isPro
    ? isTrialing
      ? "Pro (Trial)"
      : "Pro"
    : "Free"
  const intervalLabel = entitlements.interval === "year" ? "yearly" : entitlements.interval === "month" ? "monthly" : ""

  async function handleCheckout(interval: "month" | "year") {
    setLoading(true)
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
      setLoading(false)
    }
  }

  async function handlePortal() {
    setLoading(true)
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
      setLoading(false)
    }
  }

  return (
    <>
      {/* ─── Checkout success banner ─── */}
      {checkoutSuccess && !successDismissed && (
        <section className="rounded-[var(--relay-radius)] border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 text-sm">
                &#10003;
              </span>
              <div>
                <p className="text-[14px] font-semibold text-[var(--relay-ink)]">
                  Welcome to Relay Pro!
                </p>
                <p className="text-[13px] text-[var(--relay-muted)]">
                  Your subscription is active. All Pro features are now unlocked.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSuccessDismissed(true)}
              className="shrink-0 text-[var(--relay-muted)] hover:text-[var(--relay-ink)] transition text-lg leading-none"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </section>
      )}

      {/* ─── Plan card ─── */}
      <section className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Billing &amp; Plan</h2>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
            Manage your subscription and monitor usage.
          </p>
        </div>

        <div className="border-t border-[var(--relay-line)] px-5 py-5">
          {/* Current plan header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
                  isPro
                    ? "bg-[var(--relay-accent)]/10 text-[var(--relay-accent)] border border-[var(--relay-accent)]/20"
                    : "bg-[var(--relay-soft)] text-[var(--relay-muted)] border border-[var(--relay-line)]",
                )}
              >
                {planLabel}
              </span>
              {intervalLabel && (
                <span className="text-[12px] text-[var(--relay-muted)] capitalize">{intervalLabel}</span>
              )}
            </div>
            {isPro ? (
              <button
                type="button"
                onClick={() => void handlePortal()}
                disabled={loading}
                className="rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] px-4 py-2 text-[13px] font-medium text-[var(--relay-ink)] transition hover:bg-[var(--relay-soft)] disabled:opacity-50"
              >
                {loading ? "Loading..." : "Manage subscription"}
              </button>
            ) : null}
          </div>

          {/* Trial / period info */}
          {isTrialing && entitlements.trialEndsAt && (
            <p className="mt-2 text-[12px] text-[var(--relay-muted)]">
              Trial ends {new Date(entitlements.trialEndsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}
          {isPro && !isTrialing && entitlements.currentPeriodEnd && (
            <p className="mt-2 text-[12px] text-[var(--relay-muted)]">
              Renews {new Date(entitlements.currentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}

          {/* Upgrade cards for free users */}
          {!isPro && (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void handleCheckout("month")}
                disabled={loading}
                className={cn(
                  "group relative rounded-[var(--relay-radius)] border p-4 text-left transition",
                  "border-[var(--relay-line)] hover:border-[var(--relay-accent)]/40 hover:bg-[var(--relay-soft)]",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <p className="text-[13px] font-semibold text-[var(--relay-ink)]">Pro Monthly</p>
                <p className="mt-1 text-xl font-bold tracking-tight text-[var(--relay-ink)]">
                  $9<span className="text-[13px] font-normal text-[var(--relay-muted)]">/mo</span>
                </p>
                <p className="mt-2 text-[11px] text-[var(--relay-muted)]">7-day free trial</p>
              </button>
              <button
                type="button"
                onClick={() => void handleCheckout("year")}
                disabled={loading}
                className={cn(
                  "group relative rounded-[var(--relay-radius)] border p-4 text-left transition",
                  "border-[var(--relay-accent)]/30 bg-[var(--relay-accent)]/[0.03] hover:border-[var(--relay-accent)]/50 hover:bg-[var(--relay-accent)]/[0.06]",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <span className="absolute top-3 right-3 text-[10px] font-semibold tracking-wide uppercase text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                  Save 17%
                </span>
                <p className="text-[13px] font-semibold text-[var(--relay-ink)]">Pro Yearly</p>
                <p className="mt-1 text-xl font-bold tracking-tight text-[var(--relay-ink)]">
                  $90<span className="text-[13px] font-normal text-[var(--relay-muted)]">/yr</span>
                </p>
                <p className="mt-2 text-[11px] text-[var(--relay-muted)]">7-day free trial</p>
              </button>
            </div>
          )}

          {error && (
            <p className="mt-3 text-[12px] font-medium text-[var(--relay-danger)]">{error}</p>
          )}
        </div>
      </section>

      {/* ─── Usage section ─── */}
      <section className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Usage</h2>
          <p className="mt-1 text-[13px] text-[var(--relay-muted)]">
            Current period usage across plan limits.
          </p>
        </div>
        <div className="border-t border-[var(--relay-line)] px-5 py-5 space-y-4">
          <UsageMeter
            label="Active projects"
            used={usage.activeProjects}
            limit={entitlements.limits.activeProjects}
            period=""
          />
          <UsageMeter
            label="Captures"
            used={usage.capturesThisMonth}
            limit={entitlements.limits.captureMonthly}
            period="/ month"
          />
          <UsageMeter
            label="MCP reads"
            used={usage.mcpReadsToday}
            limit={entitlements.limits.mcpReadDaily}
            period="/ day"
          />
          <UsageMeter
            label="MCP writes"
            used={usage.mcpWritesToday}
            limit={entitlements.limits.mcpWriteDaily}
            period="/ day"
          />
        </div>

        {/* Upgrade nudge for free users at high usage */}
        {!isPro && (
          usage.capturesThisMonth / entitlements.limits.captureMonthly >= 0.7 ||
          usage.mcpReadsToday / entitlements.limits.mcpReadDaily >= 0.7 ||
          usage.activeProjects / entitlements.limits.activeProjects >= 0.7
        ) && (
          <div className="border-t border-[var(--relay-line)] px-5 py-4 bg-[var(--relay-accent)]/[0.03]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] text-[var(--relay-muted)]">
                Approaching plan limits? Upgrade to Pro for 10x more capacity.
              </p>
              <button
                type="button"
                onClick={() => void handleCheckout("month")}
                disabled={loading}
                className="shrink-0 rounded-[var(--relay-radius-sm)] bg-[var(--relay-accent)] px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                Upgrade
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
