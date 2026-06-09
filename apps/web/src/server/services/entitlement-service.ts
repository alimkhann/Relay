import { createRepositoryBundle } from "@relay/db"
import type { BillingStatusDto, SubscriptionRow, UserEntitlementsDto } from "@relay/shared"

import { captureServerEvent } from "@/lib/telemetry/posthog-server"
import { ForbiddenError, TooManyRequestsError } from "@/server/http/errors"
import { logServerEvent } from "@/server/logging/logger"
import { FREE_LIMITS, getDefaultEntitlements, getPlanLimits } from "./billing-config"

type WindowKey = "minute" | "day" | "month"
export type ActionQuotaFamily = "read" | "write"

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

function nextPlanFor(plan: UserEntitlementsDto["plan"]) {
  return plan === "free" ? "starter" as const : plan === "starter" ? "pro" as const : null
}

function quotaUpgradeUrl(plan: UserEntitlementsDto["plan"]) {
  return plan === "pro" ? undefined : "https://www.onrelay.app/settings?section=billing"
}

function quotaLimitError(input: {
  family: "read" | "write" | "assistant"
  plan: UserEntitlementsDto["plan"]
  limits: Array<{ window: "day" | "month"; limit: number; end: string }>
}) {
  const now = Date.now()
  const blocked = input.limits
    .map((entry) => ({ ...entry, retryAfterSeconds: Math.max(1, Math.ceil((new Date(entry.end).getTime() - now) / 1000)) }))
    .sort((a, b) => a.retryAfterSeconds - b.retryAfterSeconds)[0]!
  const label = input.family === "assistant" ? "Ask Relay" : `${input.family}s`
  const message = input.plan === "pro"
    ? `You have reached your ${blocked.window} ${label} limit. It resets at ${new Date(blocked.end).toLocaleString()}.`
    : `You have reached your ${blocked.window} ${label} limit. Upgrade for higher limits or wait until it resets.`
  return new TooManyRequestsError(message, {
    retryAfterSeconds: blocked.retryAfterSeconds,
    limit: blocked.limit,
    remaining: 0,
    plan: input.plan,
    upgradeUrl: quotaUpgradeUrl(input.plan),
    quotaFamily: input.family,
    quotaWindow: blocked.window,
    resetAt: blocked.end,
    nextPlan: nextPlanFor(input.plan),
  })
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

  const [readsToday, readsThisMonth, writesToday, writesThisMonth, handoffsThisMonth, aiAnalysesToday] = await Promise.all([
    getUsageCount(userId, "read_daily", "day"),
    getUsageCount(userId, "read_monthly", "month"),
    getUsageCount(userId, "write_daily", "day"),
    getUsageCount(userId, "write_monthly", "month"),
    getUsageCount(userId, "handoff_monthly", "month"),
    repositories.aiJobs.countRecentAiDigestRunsByUser(userId, 24),
  ])
  const [sourceIngestionsToday, sourceEmbeddedTokensThisMonth, sourceBackedRecallsToday] = await Promise.all([
    getUsageCount(userId, "source_ingestion_daily", "day"),
    getUsageCount(userId, "source_embedded_tokens_monthly", "month"),
    getUsageCount(userId, "source_backed_recall_daily", "day"),
  ])
  const [externalSourceIndexesToday, externalSourceSearchesToday, externalSourceRefreshesToday] = await Promise.all([
    getUsageCount(userId, "external_source_index_daily", "day"),
    getUsageCount(userId, "external_source_search_daily", "day"),
    getUsageCount(userId, "external_source_refresh_daily", "day"),
  ])
  const [assistantMessagesThisMonth, assistantTokensThisMonth] = await Promise.all([
    getUsageCount(userId, "assistant_messages_monthly", "month"),
    getUsageCount(userId, "assistant_tokens_monthly", "month"),
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
      capturesThisMonth: writesThisMonth,
      mcpReadsToday: readsToday,
      mcpWritesToday: writesToday,
      readsToday,
      readsThisMonth,
      writesToday,
      writesThisMonth,
      handoffsThisMonth,
      activeProjects: activeProjects.filter((project) => !project.isArchived).length,
      aiAnalysesToday,
      sourceIngestionsToday,
      sourceEmbeddedTokensThisMonth,
      sourceBackedRecallsToday,
      externalSourceIndexesToday,
      externalSourceSearchesToday,
      externalSourceRefreshesToday,
      assistantMessagesThisMonth,
      assistantTokensThisMonth,
    },
  }
}

export async function getUsageCount(userId: string, featureKey: string, windowKey: WindowKey) {
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

export async function consumeActionQuota(userId: string, family: ActionQuotaFamily, amount = 1) {
  const entitlements = await resolveViewerEntitlements(userId)
  const dailyLimit = family === "read" ? entitlements.limits.readsDaily : entitlements.limits.writesDaily
  const monthlyLimit = family === "read" ? entitlements.limits.readsMonthly : entitlements.limits.writesMonthly
  const daily = getWindowBounds("day")
  const monthly = getWindowBounds("month")
  const repositories = createRepositoryBundle(userId)
  const rows = await repositories.usageCounters.incrementWithinLimits(
    `user:${userId}`,
    [
      { featureKey: `${family}_daily`, windowKey: "day", windowStart: daily.start, windowEnd: daily.end, limit: dailyLimit },
      { featureKey: `${family}_monthly`, windowKey: "month", windowStart: monthly.start, windowEnd: monthly.end, limit: monthlyLimit },
    ],
    amount,
  )
  if (!rows) {
    captureServerEvent({
      event: "quota_blocked",
      distinctId: userId,
      properties: { family, plan: entitlements.plan, next_plan: nextPlanFor(entitlements.plan) },
    })
    throw quotaLimitError({
      family,
      plan: entitlements.plan,
      limits: [
        { window: "day", limit: dailyLimit, end: daily.end },
        { window: "month", limit: monthlyLimit, end: monthly.end },
      ],
    })
  }
  const dailyRow = rows.find((row) => row.windowKey === "day")!
  const monthlyRow = rows.find((row) => row.windowKey === "month")!
  captureServerEvent({
    event: "quota_consumed",
    distinctId: userId,
    properties: {
      family,
      plan: entitlements.plan,
      amount,
      daily_used: dailyRow.count,
      daily_limit: dailyLimit,
      monthly_used: monthlyRow.count,
      monthly_limit: monthlyLimit,
    },
  })
  return {
    family,
    daily: { used: dailyRow.count, limit: dailyLimit, remaining: dailyLimit - dailyRow.count },
    monthly: { used: monthlyRow.count, limit: monthlyLimit, remaining: monthlyLimit - monthlyRow.count },
  }
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
    throw new ForbiddenError("Fresh-chat context is available on paid Relay plans.")
  }
}

export async function consumeCaptureQuota(userId: string) {
  return consumeActionQuota(userId, "write")
}

export async function consumeMcpBasicReadQuota(userId: string) {
  return consumeActionQuota(userId, "read")
}

export async function consumeMcpDeepReadQuota(userId: string) {
  return consumeActionQuota(userId, "read")
}

export async function consumeMcpReadQuota(userId: string, mode: "basic" | "deep" = "basic") {
  return mode === "deep" ? consumeMcpDeepReadQuota(userId) : consumeMcpBasicReadQuota(userId)
}

export async function consumeMcpWriteQuota(userId: string, amount = 1) {
  return consumeActionQuota(userId, "write", amount)
}

export async function consumeExternalSourceMcpActionQuota(userId: string) {
  const entitlements = await resolveViewerEntitlements(userId)
  return consumeQuota(
    userId,
    "external_source_mcp_action_minute",
    "minute",
    entitlements.limits.externalSourceMcpActionsPerMinute,
    1,
    entitlements.plan,
  )
}

// Compatibility entry point for explicit extension writes. These now consume
// the same canonical write action quota as dashboard, Ask Relay, and MCP writes.
export async function consumeExtensionMemoryWriteQuota(userId: string, amount = 1) {
  return consumeActionQuota(userId, "write", amount)
}

// Ask Relay. Free plan is a small monthly taste then a hard paywall; paid
// plans get a generous daily allowance. Token spend is additionally capped
// monthly so AI cost stays bounded even for paid plans.
export async function consumeAssistantMessageQuota(userId: string) {
  const entitlements = await resolveViewerEntitlements(userId)
  const day = getWindowBounds("day")
  const month = getWindowBounds("month")
  const repositories = createRepositoryBundle(userId)
  const rows = await repositories.usageCounters.incrementWithinLimits(`user:${userId}`, [
    { featureKey: "assistant_messages_daily", windowKey: "day", windowStart: day.start, windowEnd: day.end, limit: entitlements.limits.assistantMessagesDaily },
    { featureKey: "assistant_messages_monthly", windowKey: "month", windowStart: month.start, windowEnd: month.end, limit: entitlements.limits.assistantMessagesMonthly },
  ])
  if (!rows) {
    throw quotaLimitError({
      family: "assistant",
      plan: entitlements.plan,
      limits: [
        { window: "day", limit: entitlements.limits.assistantMessagesDaily, end: day.end },
        { window: "month", limit: entitlements.limits.assistantMessagesMonthly, end: month.end },
      ],
    })
  }
  return rows
}

// Hard pre-turn gate: the monthly token bucket is recorded after each turn
// (so the in-flight response always finishes), but the *next* turn must be
// blocked once the cap is exceeded or AI cost is unbounded. Throws the same
// TooManyRequestsError shape consumeQuota uses, so withApiRoute renders the
// 429 upgrade payload the client already understands.
export async function assertAssistantTokenBudget(userId: string) {
  const entitlements = await resolveViewerEntitlements(userId)
  const limit = entitlements.limits.assistantTokensMonthly
  const used = await getUsageCount(userId, "assistant_tokens_monthly", "month")
  if (used >= limit) {
    const { end } = getWindowBounds("month")
    const retryAfterSeconds = Math.max(1, Math.ceil((new Date(end).getTime() - Date.now()) / 1000))
    throw new TooManyRequestsError(
      "You have reached your plan's monthly Ask Relay AI usage limit.",
      {
        retryAfterSeconds,
        limit,
        remaining: 0,
        plan: entitlements.plan,
        upgradeUrl: quotaUpgradeUrl(entitlements.plan),
        quotaFamily: "assistant",
        quotaWindow: "month",
        resetAt: end,
        nextPlan: nextPlanFor(entitlements.plan),
      },
    )
  }
}

export async function consumeAssistantTokenQuota(userId: string, totalTokens: number) {
  const entitlements = await resolveViewerEntitlements(userId)
  return consumeQuota(
    userId,
    "assistant_tokens_monthly",
    "month",
    entitlements.limits.assistantTokensMonthly,
    Math.max(1, Math.ceil(totalTokens)),
    entitlements.plan,
  )
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
