import { createRepositoryBundle } from "@relay/db"
import type { BillingStatusDto, UserEntitlementsDto } from "@relay/shared"

import { ForbiddenError, TooManyRequestsError } from "@/server/http/errors"
import { FREE_LIMITS, getDefaultEntitlements, getPlanLimits } from "./billing-config"

type WindowKey = "minute" | "day" | "month"

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
    isPro: entitlement.planKey === "pro",
    isTrialing,
    trialEndsAt: entitlement.trialEndsAt,
    currentPeriodEnd: entitlement.currentPeriodEnd,
    features: {
      browserCapture: true,
      mcpRead: true,
      mcpWrite: true,
      handoffPacks: entitlement.handoffEnabled,
    },
    limits,
  }
}

export async function getBillingStatusForUser(userId: string): Promise<BillingStatusDto> {
  const repositories = createRepositoryBundle(userId)
  const [entitlements, customer, activeProjects] = await Promise.all([
    resolveViewerEntitlements(userId),
    repositories.billingCustomers.getByUserId(userId),
    repositories.projects.listByOwner(userId),
  ])

  const capturesThisMonth = await getUsageCount(userId, "capture_monthly", "month")
  const mcpReadsToday = await getUsageCount(userId, "mcp_read_daily", "day")
  const mcpWritesToday = await getUsageCount(userId, "mcp_write_daily", "day")
  const handoffsThisMonth = await getUsageCount(userId, "handoff_monthly", "month")

  return {
    entitlements,
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
        upgradeUrl: "https://onrelay.app/settings?section=billing"
      }
    )
  }
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
    throw new ForbiddenError("Handoff packs are available on Relay Pro.")
  }
}

export async function consumeCaptureQuota(userId: string) {
  const entitlements = await resolveViewerEntitlements(userId)
  return consumeQuota(userId, "capture_monthly", "month", entitlements.limits.captureMonthly, 1, entitlements.plan)
}

export async function consumeMcpReadQuota(userId: string) {
  const entitlements = await resolveViewerEntitlements(userId)
  return consumeQuota(userId, "mcp_read_daily", "day", entitlements.limits.mcpReadDaily, 1, entitlements.plan)
}

export async function consumeMcpWriteQuota(userId: string, amount = 1) {
  const entitlements = await resolveViewerEntitlements(userId)
  return consumeQuota(userId, "mcp_write_daily", "day", entitlements.limits.mcpWriteDaily, amount, entitlements.plan)
}

export async function consumeHandoffQuota(userId: string) {
  await assertHandoffEnabled(userId)
  const entitlements = await resolveViewerEntitlements(userId)
  const limit = entitlements.plan === "pro" ? 200 : 0
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
  plan: "free" | "pro"
  status: UserEntitlementsDto["status"]
  interval: UserEntitlementsDto["interval"]
  providerCustomerId?: string | null
  providerSubscriptionId?: string | null
  trialEndsAt?: string | null
  currentPeriodEnd?: string | null
}) {
  const limits = input.plan === "pro" ? getPlanLimits("pro") : FREE_LIMITS
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
    handoffEnabled: input.plan === "pro",
    trialEndsAt: input.trialEndsAt ?? null,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    updatedAt: new Date().toISOString(),
  }
}
