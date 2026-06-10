"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as Tooltip from "@radix-ui/react-tooltip"
import { Zap, ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import {
  buildCoreUsageMetrics,
  pickRollingPool,
  type UsageMetric,
} from "@relay/shared/utils/usage-metrics"

import { useBillingStatus } from "@/features/billing/use-billing-status"
import { cn } from "@/lib/cn"

interface SidebarPlanWidgetProps {
  plan: string
  isPaid: boolean
  capturesUsed: number
  capturesLimit: number
  collapsed: boolean
}

const ROLL_MS = 10_000
const MANUAL_PAUSE_MS = 30_000

function barColorFor(used: number, limit: number) {
  const ratio = limit > 0 ? used / limit : 0
  return ratio >= 0.95 ? "bg-red-500" : ratio >= 0.8 ? "bg-amber-500" : "bg-emerald-500"
}

export function SidebarPlanWidget({
  plan,
  isPaid,
  capturesUsed,
  capturesLimit,
  collapsed,
}: SidebarPlanWidgetProps) {
  const { data: billing } = useBillingStatus()

  // Fallback to the SSR-threaded monthly write number until billing loads, so the
  // widget never flashes empty.
  const metrics: UsageMetric[] = useMemo(() => {
    if (billing) return buildCoreUsageMetrics(billing)
    return [
      {
        key: "writes_monthly",
        label: "Writes this month",
        used: capturesUsed,
        limit: capturesLimit,
        period: "mo",
      },
    ]
  }, [billing, capturesUsed, capturesLimit])

  const pool = useMemo(() => pickRollingPool(metrics), [metrics])

  const [index, setIndex] = useState(0)
  const lastManualRef = useRef(0)
  const safeIndex = pool.length > 0 ? index % pool.length : 0
  const active = pool[safeIndex] ?? metrics[0]!

  const effectivePlan = billing?.entitlements.plan ?? plan
  const effectiveIsPaid = billing?.entitlements.isPaid ?? isPaid
  const planLabel =
    effectivePlan.charAt(0).toUpperCase() + effectivePlan.slice(1)
  const activeRatio = active.limit > 0 ? active.used / active.limit : 0
  const showUpgradeCta =
    !effectiveIsPaid || (effectivePlan === "starter" && activeRatio >= 0.7)
  const canRoll = pool.length > 1

  // Auto-roll every 10s, paused for 30s after a manual switch, disabled under
  // reduced-motion.
  useEffect(() => {
    if (!canRoll) return
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduced) return
    const id = window.setInterval(() => {
      if (Date.now() - lastManualRef.current < MANUAL_PAUSE_MS) return
      setIndex((i) => (i + 1) % pool.length)
    }, ROLL_MS)
    return () => window.clearInterval(id)
  }, [canRoll, pool.length])

  function step(delta: number) {
    lastManualRef.current = Date.now()
    setIndex((i) => (i + delta + pool.length) % pool.length)
  }

  if (collapsed) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Link
            href="/settings?section=billing"
            className="flex items-center justify-center rounded-[var(--relay-radius-sm)] p-2 text-[var(--relay-muted)] transition-colors hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
          >
            <Zap className="h-4 w-4 shrink-0" />
          </Link>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={8}
            className="z-50 max-w-[200px] rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-3 py-2 text-[11px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow)]"
          >
            <p>{planLabel} plan</p>
            <p className="mt-0.5 text-[var(--relay-bg)]/70">
              {active.used}/{active.limit} {active.label.toLowerCase()}
            </p>
            <Tooltip.Arrow className="fill-[var(--relay-ink)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    )
  }

  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--relay-faint)]">
          <Zap className="h-3 w-3" />
          {planLabel}
        </span>
        {showUpgradeCta && (
          <Link
            href="/settings?section=billing"
            className="text-[10px] font-semibold text-[var(--relay-accent)] transition-colors hover:text-[var(--relay-accent)]/80"
          >
            Upgrade
          </Link>
        )}
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-0.5 text-[var(--relay-muted)]">
            {canRoll && (
              <button
                type="button"
                aria-label="Previous usage metric"
                onClick={() => step(-1)}
                className="-ml-1 rounded p-0.5 text-[var(--relay-faint)] transition-colors hover:text-[var(--relay-ink)]"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
            )}
            {active.label}
            {canRoll && (
              <button
                type="button"
                aria-label="Next usage metric"
                onClick={() => step(1)}
                className="rounded p-0.5 text-[var(--relay-faint)] transition-colors hover:text-[var(--relay-ink)]"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </span>
          <span className="tabular-nums text-[var(--relay-muted)]">
            {active.used}
            <span className="text-[var(--relay-faint)]">/{active.limit}</span>
            <span className="ml-0.5 text-[var(--relay-faint)]">/{active.period}</span>
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--relay-line)]">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              barColorFor(active.used, active.limit),
            )}
            style={{ width: `${Math.min(activeRatio * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
