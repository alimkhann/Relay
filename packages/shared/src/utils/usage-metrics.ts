import type { BillingStatusDto } from "../types/billing"

export interface UsageMetric {
  key: string
  label: string
  used: number
  limit: number
  /** Short period suffix, e.g. "mo" or "day". */
  period: string
}

/**
 * Curated "core" usage metrics shown in the rolling widget (web sidebar +
 * extension). Order matters — it's the rotation order when everything is 0.
 */
export function buildCoreUsageMetrics(billing: BillingStatusDto): UsageMetric[] {
  const { usage, entitlements } = billing
  const limits = entitlements.limits
  return [
    {
      key: "reads_daily",
      label: "Reads today",
      used: usage.readsToday,
      limit: limits.readsDaily,
      period: "day",
    },
    {
      key: "reads_monthly",
      label: "Reads this month",
      used: usage.readsThisMonth,
      limit: limits.readsMonthly,
      period: "mo",
    },
    {
      key: "writes_daily",
      label: "Writes today",
      used: usage.writesToday,
      limit: limits.writesDaily,
      period: "day",
    },
    {
      key: "writes_monthly",
      label: "Writes this month",
      used: usage.writesThisMonth,
      limit: limits.writesMonthly,
      period: "mo",
    },
  ]
}

/**
 * Rotation pool: metrics with any usage. If nothing has been used yet, the
 * whole core set rotates so the widget still demonstrates what it tracks.
 */
export function pickRollingPool(metrics: UsageMetric[]): UsageMetric[] {
  const used = metrics.filter((m) => m.used > 0)
  return used.length > 0 ? used : metrics
}
