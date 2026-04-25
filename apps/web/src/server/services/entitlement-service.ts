import { createRepositoryBundle } from "@relay/db"
import type { BillingStatusDto, SubscriptionRow, UserEntitlementsDto } from "@relay/shared"

import { ForbiddenError, TooManyRequestsError } from "@/server/http/errors"
import { logServerEvent } from "@/server/logging/logger"
import { FREE_LIMITS, getDefaultEntitlements, getPlanLimits } from "./billing-config"

type WindowKey = "minute" | "day" | "month"

function coerceRawTimestamp(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  return null
}

function getSubscriptionPeriodEnd(subscription: SubscriptionRow) {
  return (
    subscription.currentPeriodEnd ??
    coerceRawTimestamp(subscription.raw["currentPeriodEnd"]) ??
    coerceRawTimestamp(subscription.raw["endsAt"])
  )
}

function pickBillingSubscription(subscriptions: SubscriptionRow[]) {
  const activeStatuses = new Set<SubscriptionRow["status"]>(["active", "trialing", "past_due"])
  const planRank = { free: 0, starter: 1, pro: 2 } as const
  const activeSubscriptions = subscriptions.filter(
    (subscription) => subscription.planKey !== "free" && activeStatuses.has(subscription.status),
  )

  activeSubscriptions.sort((a, b) => {
    const rankDelta = planRank[b.planKey] - planRank[a.planKey]
    if (rankDelta !== 0) return rankDelta
    return (getSubscriptionPeriodEnd(b) ?? "").localeCompare(getSubscriptionPeriodEnd(a) ?? "")
  })

  return activeSubscriptions[0] ?? null
}

function getWindowBounds(windowKey: WindowKey, now = new Date()) {
  const start = new Date(now)
  if (windowKey === "minute") {
    start.setSeconds(0, 0)
  } else if (windowKey === "day") {
    start.setUTCHours(0, 0, 0, 0)
  } else {
    start.setUTCDate(1)
    start.setUTCHours(0, 0, 0, 0)
  }

  const end = new Date(start)
  if (windowKey === "minute") end.setMinutes(end.getMinutes() + 1)
  else if (windowKey === "day") end.setUTCDate(end.getUTCDate() + 1)
  else end.setUTCMonth(end.getUTCMonth() + 1)

  return { start: start.toISOString(), end: end.toISOString() }
}

export async function resolveViewerEntitlements(userId: string): Promise<UserEntitlementsDto> {
  const repositories = createRepositoryBundle(userId)
  const entitlement = await repositories.entitlements.getByUserId(userId)
  if (!entitlement) {
    return getDefaultEntitlements()
  }

  const limits = getPlanLimits(entitlement.planKey)
  const isTrialing = entitlement.status === "trialing" && Boolean(entitlement.trialEndsAt)

  return {
    plan: entitlement.planKey,
    status: entitlement.status,
    interval: entitlement.interval,
    isPaid: entitlement.planKey !== "free",
    isPro: entitlement.planKey === "pro",
    isTrialing,
    trialEndsAt: entitlement.trialEndsAt,
    currentPeriodEnd: entitlement.currentPeriodEnd,
    features: {
      browserCapture: true,
      mcpRead: true,
      mcpWrite: true,
      handoffPacks: entitlement.handoffEnabled,
      autonomousCanon: entitlement.planKey !== "free",
      highQualityModel: entitlement.planKey === "pro",
    },
    limits,
  }
}

export async function getBillingStatusForUser(userId: string): Promise<BillingStatusDto> {
  const repositories = createRepositoryBundle(userId)
  const [entitlements, customer, activeProjects, subscriptions] = await Promise.all([
    resolveViewerEntitlements(userId),
    repositories.billingCustomers.getByUserId(userId),
    repositories.projects.listByOwner(userId),
    repositories.subscriptions.listByUser(userId),
  ])
  const activeSubscription = pickBillingSubscription(subscriptions)

  const [capturesThisMonth, mcpReadsToday, mcpWritesToday, handoffsThisMonth, aiAnalysesToday] = await Promise.all([
    getUsageCount(userId, "capture_monthly", "month"),
    getUsageCount(userId, "mcp_read_daily", "day"),
    getUsageCount(userId, "mcp_write_daily", "day"),
    getUsageCount(userId, "handoff_monthly", "month"),
    repositories.aiJobs.countRecentAiDigestRunsByUser(userId, 24),
  ])

  return {
    entitlements,
    subscription: activeSubscription
      ? {
          providerSubscriptionId: activeSubscription.providerSubscriptionId,
          plan: activeSubscription.planKey,
          status: activeSubscription.status,
          interval: activeSubscription.interval,
          cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
          currentPeriodEnd: getSubscriptionPeriodEnd(activeSubscription),
        }
      : null,
    customer: {
      providerCustomerId: customer?.providerCustomerId ?? null,
      email: customer?.email ?? null,
      name: customer?.name ?? null,
    },
    usage: {
      capturesThisMonth,
      mcpReadsToday,
      mcpWritesToday,
      handoffsThisMonth,
      activeProjects: activeProjects.filter((project) => !project.isArchived).length,
      aiAnalysesToday,
    },
  }
}

async function getUsageCount(userId: string, featureKey: string, windowKey: WindowKey) {
  const repositories = createRepositoryBundle(userId)
  const { start } = getWindowBounds(windowKey)
  const counter = await repositories.usageCounters.get(`user:${userId}`, featureKey, windowKey, start)
  return counter?.count ?? 0
}

export async function consumeQuota(userId: string, featureKey: string, windowKey: WindowKey, limit: number, amount = 1, plan?: string) {
  const repositories = createRepositoryBundle(userId)
  const { start, end } = getWindowBounds(windowKey)
  const counter = await repositories.usageCounters.incrementWithinLimit(`user:${userId}`, featureKey, windowKey, start, end, limit, amount)
  if (!counter) {
    const windowEnd = new Date(end)
    const retryAfterSeconds = Math.ceil((windowEnd.getTime() - Date.now()) / 1000)
    throw new TooManyRequestsError(
      "You have reached the current plan limit for this feature.",
      {
        retryAfterSeconds,
        limit,
        remaining: 0,
        plan: plan ?? "free",
        upgradeUrl: "https://www.onrelay.app/settings?section=billing"
      }
    )
  }
  await logServerEvent({
    level: "info",
    surface: "web-api",
    area: "billing",
    event: "quota_consumed",
    message: "Consumed Relay quota for a billing-scoped feature.",
    userId,
    context: {
      featureKey,
      windowKey,
      amount,
      limit,
      remaining: limit - counter.count,
      plan: plan ?? "free",
    },
  }).catch(() => {})
  return { ...counter, limit, remaining: limit - counter.count }
}

export async function assertProjectCreationAllowed(userId: string) {
  const repositories = createRepositoryBundle(userId)
  const [entitlements, projects] = await Promise.all([
    resolveViewerEntitlements(userId),
    repositories.projects.listByOwner(userId),
  ])

  const activeProjects = projects.filter((project) => !project.isArchived).length
  if (activeProjects >= entitlements.limits.activeProjects) {
    throw new ForbiddenError("Project limit reached for your current plan.")
  }
}

export async function assertHandoffEnabled(userId: string) {
  const entitlements = await resolveViewerEntitlements(userId)
  if (!entitlements.features.handoffPacks) {
    throw new ForbiddenError("Brief exports are available on Relay Pro.")
  }
}

export async function consumeCaptureQuota(userId: string) {
  const entitlements = await resolveViewerEntitlements(userId)
  return consumeQuota(userId, "capture_monthly", "month", entitlements.limits.captureMonthly, 1, entitlements.plan)
}

export async function consumeMcpBasicReadQuota(userId: string) {
  const entitlements = await resolveViewerEntitlements(userId)
  return consumeQuota(userId, "mcp_read_daily", "day", entitlements.limits.mcpReadDaily, 1, entitlements.plan)
}

export async function consumeMcpDeepReadQuota(userId: string) {
  const entitlements = await resolveViewerEntitlements(userId)
  return consumeQuota(userId, "mcp_deep_read_daily", "day", entitlements.limits.mcpDeepReadDaily, 1, entitlements.plan)
}

export async function consumeMcpReadQuota(userId: string, mode: "basic" | "deep" = "basic") {
  return mode === "deep" ? consumeMcpDeepReadQuota(userId) : consumeMcpBasicReadQuota(userId)
}

export async function consumeMcpWriteQuota(userId: string, amount = 1) {
  const entitlements = await resolveViewerEntitlements(userId)
  return consumeQuota(userId, "mcp_write_daily", "day", entitlements.limits.mcpWriteDaily, amount, entitlements.plan)
}

// Rate limit for explicit user-triggered memory writes from the extension
// (sidepanel "Save to project" button + right-click "Save to Relay" context
// menu). Kept in its own bucket so it doesn't compete with MCP write budget.
// Free is intentionally tight so users can see value without camping on the
// free tier indefinitely.
const FREE_EXTENSION_MEMORY_WRITE_LIMIT = 2
const PRO_EXTENSION_MEMORY_WRITE_LIMIT = 200

export async function consumeExtensionMemoryWriteQuota(userId: string, amount = 1) {
  const entitlements = await resolveViewerEntitlements(userId)
  const limit =
    entitlements.plan === "pro"
      ? PRO_EXTENSION_MEMORY_WRITE_LIMIT
      : FREE_EXTENSION_MEMORY_WRITE_LIMIT
  return consumeQuota(userId, "extension_memory_write_daily", "day", limit, amount, entitlements.plan)
}

export async function consumeHandoffQuota(userId: string) {
  await assertHandoffEnabled(userId)
  const entitlements = await resolveViewerEntitlements(userId)
  const limit = entitlements.plan === "pro" ? 300 : entitlements.plan === "starter" ? 120 : 0
  return consumeQuota(userId, "handoff_monthly", "month", limit, 1, entitlements.plan)
}

export async function consumeIpRateLimit(scopeKey: string, featureKey: string, perMinuteLimit: number) {
  const repositories = createRepositoryBundle()
  const { start, end } = getWindowBounds("minute")
  const counter = await repositories.usageCounters.incrementWithinLimit(scopeKey, featureKey, "minute", start, end, perMinuteLimit, 1)
  if (!counter) {
    throw new TooManyRequestsError("Too many requests. Please try again in a moment.")
  }
  return counter
}

export function buildEntitlementRowFromPlan(input: {
  userId: string
  plan: "free" | "starter" | "pro"
  status: UserEntitlementsDto["status"]
  interval: UserEntitlementsDto["interval"]
  providerCustomerId?: string | null
  providerSubscriptionId?: string | null
  trialEndsAt?: string | null
  currentPeriodEnd?: string | null
}) {
  const limits = input.plan === "free" ? FREE_LIMITS : getPlanLimits(input.plan)
  return {
    userId: input.userId,
    planKey: input.plan,
    status: input.status,
    providerCustomerId: input.providerCustomerId ?? null,
    providerSubscriptionId: input.providerSubscriptionId ?? null,
    interval: input.interval,
    activeProjectsLimit: limits.activeProjects,
    historyRetentionDays: limits.historyRetentionDays,
    captureLimitMonthly: limits.captureMonthly,
    mcpReadLimitDaily: limits.mcpReadDaily,
    mcpWriteLimitDaily: limits.mcpWriteDaily,
    handoffEnabled: input.plan !== "free",
    trialEndsAt: input.trialEndsAt ?? null,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    updatedAt: new Date().toISOString(),
  }
}
