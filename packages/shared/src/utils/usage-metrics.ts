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
      key: "captures",
      label: "Captures",
      used: usage.capturesThisMonth,
      limit: limits.captureMonthly,
      period: "mo",
    },
    {
      key: "mcp_reads",
      label: "MCP reads",
      used: usage.mcpReadsToday,
      limit: limits.mcpReadDaily,
      period: "day",
    },
    {
      key: "mcp_writes",
      label: "MCP writes",
      used: usage.mcpWritesToday,
      limit: limits.mcpWriteDaily,
      period: "day",
    },
    {
      key: "external_indexes",
      label: "External indexes",
      used: usage.externalSourceIndexesToday,
      limit: limits.externalSourceIndexesDaily,
      period: "day",
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
