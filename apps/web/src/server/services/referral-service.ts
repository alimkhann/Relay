import { createHmac, randomBytes, timingSafeEqual } from "crypto"

import { createRepositoryBundle, type RepositoryBundle } from "@relay/db"
import type { BillingInterval, BillingPlanKey, ReferralRow, SubscriptionRow } from "@relay/shared"

import { PRICING } from "@/app/(marketing)/pricing.config"
import { APP_ORIGIN } from "@/lib/site-config"
import { logServerEvent } from "@/server/logging/logger"

export const REFERRAL_COOKIE_NAME = "relay_referral"
const REFERRAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const REFERRAL_CODE_BYTES = 6
const REFERRAL_ROLLING_WINDOW_DAYS = 365

const REFERRER_TIERS = [
  { minimumQualifiedReferrals: 5, basisPoints: 10000 },
  { minimumQualifiedReferrals: 3, basisPoints: 5000 },
  { minimumQualifiedReferrals: 1, basisPoints: 2500 },
] as const

export function getReferralRewardBasisPoints(qualifiedReferralCount: number) {
  return REFERRER_TIERS.find((tier) => qualifiedReferralCount >= tier.minimumQualifiedReferrals)?.basisPoints ?? 0
}

export function getReferralRefereeDiscountBasisPoints(interval: Exclude<BillingInterval, null>) {
  return interval === "year" ? 1000 : 2000
}

export function getReferralRewardQualification(interval: Exclude<BillingInterval, null>) {
  return interval === "year"
    ? { minimumPaidInvoiceCount: 1, holdDaysAfterFirstPaidInvoice: 30 }
    : { minimumPaidInvoiceCount: 2, holdDaysAfterFirstPaidInvoice: 0 }
}

export function isReferralRewardQualifiable(input: {
  interval: Exclude<BillingInterval, null>
  paidInvoiceCount: number
  firstPaidAt: string | null
  now?: Date
}) {
  const qualification = getReferralRewardQualification(input.interval)
  if (input.paidInvoiceCount < qualification.minimumPaidInvoiceCount) return false
  if (!input.firstPaidAt) return false
  if (qualification.holdDaysAfterFirstPaidInvoice === 0) return true

  const firstPaidAt = new Date(input.firstPaidAt)
  if (Number.isNaN(firstPaidAt.getTime())) return false
  const now = input.now ?? new Date()
  return now.getTime() - firstPaidAt.getTime() >= qualification.holdDaysAfterFirstPaidInvoice * 24 * 60 * 60 * 1000
}

export function getReferralRewardValueCents(plan: Exclude<BillingPlanKey, "free">, basisPoints: number) {
  const monthlyPrice = PRICING[plan].monthlyPrice
  return Math.round(monthlyPrice * 100 * (basisPoints / 10000))
}

function referralSecret() {
  return process.env["RELAY_REFERRAL_COOKIE_SECRET"] ?? process.env["NEON_AUTH_COOKIE_SECRET"] ?? "relay-referral-dev-secret"
}

function signReferralCode(code: string) {
  return createHmac("sha256", referralSecret()).update(code).digest("base64url")
}

export function encodeReferralCookie(code: string) {
  return `${code}.${signReferralCode(code)}`
}

export function decodeReferralCookie(value: string | null | undefined) {
  if (!value) return null
  const [code, signature] = value.split(".")
  if (!code || !signature || !/^[A-Za-z0-9_-]{6,32}$/.test(code)) return null
  const expected = signReferralCode(code)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) return null
  return timingSafeEqual(actualBuffer, expectedBuffer) ? code : null
}

export function getReferralCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
  }
}

function createReferralCode() {
  return randomBytes(REFERRAL_CODE_BYTES).toString("base64url")
}

export async function getOrCreateReferralCodeForUser(userId: string, repositories = createRepositoryBundle(userId)) {
  const existing = await repositories.referralCodes.getByUserId(userId)
  if (existing) return existing

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await repositories.referralCodes.create({
        userId,
        code: createReferralCode(),
      })
    } catch (error) {
      if (attempt === 4) throw error
    }
  }

  throw new Error("Could not create referral code.")
}

export async function attachReferralForUser(input: {
  refereeUserId: string
  refereeEmail?: string | null
  code: string | null
  repositories?: RepositoryBundle
}) {
  if (!input.code) return null
  const repositories = input.repositories ?? createRepositoryBundle(input.refereeUserId)
  const existing = await repositories.referrals.getByRefereeId(input.refereeUserId)
  if (existing) return existing

  const referralCode = await repositories.referralCodes.getByCode(input.code)
  if (!referralCode || referralCode.userId === input.refereeUserId) return null

  return repositories.referrals.create({
    referrerId: referralCode.userId,
    refereeId: input.refereeUserId,
    referralCodeId: referralCode.id,
    refereeEmail: input.refereeEmail ?? null,
  })
}

export async function markReferralActivated(refereeUserId: string, repositories = createRepositoryBundle(refereeUserId)) {
  const referral = await repositories.referrals.getByRefereeId(refereeUserId)
  if (!referral || referral.status !== "pending_signup") return referral
  return repositories.referrals.markActivated(referral.id)
}

function getSubscriptionPaidPeriodStart(subscription: SubscriptionRow) {
  return subscription.currentPeriodStart ?? (typeof subscription.raw["currentPeriodStart"] === "string" ? subscription.raw["currentPeriodStart"] : null)
}

export async function recordReferralPaidSubscription(input: {
  userId: string
  subscription: SubscriptionRow
  now?: Date
  repositories?: RepositoryBundle
  applyRewardDiscount?: (input: { rewardId: string; referrerId: string; plan: Exclude<BillingPlanKey, "free">; basisPoints: number; valueCents: number; subscriptionId: string }) => Promise<{ providerDiscountId: string | null }>
}) {
  if (input.subscription.planKey === "free" || input.subscription.status !== "active" || !input.subscription.interval) return null

  const repositories = input.repositories ?? createRepositoryBundle(input.userId)
  const referral = await repositories.referrals.getByRefereeId(input.userId)
  if (!referral || referral.status === "rejected" || referral.status === "revoked" || referral.status === "rewarded") return referral

  const periodStart = getSubscriptionPaidPeriodStart(input.subscription)
  const nextPaidInvoiceCount = referral.lastPaidPeriodStart && referral.lastPaidPeriodStart === periodStart
    ? referral.paidInvoiceCount
    : referral.paidInvoiceCount + 1
  const firstPaidAt = referral.firstPaidAt ?? new Date().toISOString()

  const paidReferral = await repositories.referrals.markPaid({
    id: referral.id,
    providerSubscriptionId: input.subscription.providerSubscriptionId,
    planKey: input.subscription.planKey,
    interval: input.subscription.interval,
    paidInvoiceCount: nextPaidInvoiceCount,
    firstPaidAt,
    lastPaidPeriodStart: periodStart,
  })

  if (!isReferralRewardQualifiable({
    interval: input.subscription.interval,
    paidInvoiceCount: paidReferral.paidInvoiceCount,
    firstPaidAt: paidReferral.firstPaidAt,
    now: input.now,
  })) {
    return paidReferral
  }

  const qualified = await repositories.referrals.markQualified(paidReferral.id)
  await createQualifiedReferrerReward({
    referral: qualified,
    repositories,
    applyRewardDiscount: input.applyRewardDiscount,
  })
  return qualified
}

async function createQualifiedReferrerReward(input: {
  referral: ReferralRow
  repositories: RepositoryBundle
  applyRewardDiscount?: (input: { rewardId: string; referrerId: string; plan: Exclude<BillingPlanKey, "free">; basisPoints: number; valueCents: number; subscriptionId: string }) => Promise<{ providerDiscountId: string | null }>
}) {
  const existing = await input.repositories.referralRewards.getByReferralId(input.referral.id)
  if (existing) return existing

  const since = new Date(Date.now() - REFERRAL_ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const qualifiedCount = await input.repositories.referrals.countQualifiedByReferrerSince(input.referral.referrerId, since)
  const basisPoints = getReferralRewardBasisPoints(qualifiedCount)
  if (basisPoints <= 0) return null

  const [entitlement, subscriptions] = await Promise.all([
    input.repositories.entitlements.getByUserId(input.referral.referrerId),
    input.repositories.subscriptions.listByUser(input.referral.referrerId),
  ])
  if (!entitlement || entitlement.planKey === "free" || entitlement.status !== "active") {
    return input.repositories.referralRewards.create({
      referralId: input.referral.id,
      userId: input.referral.referrerId,
      basisPoints,
      valueCents: getReferralRewardValueCents("starter", basisPoints),
      status: "reserved",
    })
  }

  const activeSubscription = subscriptions.find((subscription) => subscription.providerSubscriptionId === entitlement.providerSubscriptionId)
  const valueCents = getReferralRewardValueCents(entitlement.planKey, basisPoints)
  const reward = await input.repositories.referralRewards.create({
    referralId: input.referral.id,
    userId: input.referral.referrerId,
    basisPoints,
    valueCents,
    status: activeSubscription ? "pending" : "reserved",
  })

  if (!activeSubscription || !input.applyRewardDiscount) return reward

  try {
    const applied = await input.applyRewardDiscount({
      rewardId: reward.id,
      referrerId: input.referral.referrerId,
      plan: entitlement.planKey,
      basisPoints,
      valueCents,
      subscriptionId: activeSubscription.providerSubscriptionId,
    })
    return input.repositories.referralRewards.markApplied(reward.id, applied.providerDiscountId)
  } catch (error) {
    await logServerEvent({
      level: "error",
      surface: "web-api",
      area: "referrals",
      event: "referral.reward_apply_failed",
      message: "Failed to apply referral reward discount.",
      userId: input.referral.referrerId,
      context: { referralId: input.referral.id, rewardId: reward.id },
      error,
    })
    return reward
  }
}

export async function getReferralProgramForUser(userId: string) {
  const repositories = createRepositoryBundle(userId)
  const [code, rewards, qualifiedCount] = await Promise.all([
    getOrCreateReferralCodeForUser(userId, repositories),
    repositories.referralRewards.listByUserId(userId),
    repositories.referrals.countQualifiedByReferrerSince(
      userId,
      new Date(Date.now() - REFERRAL_ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    ),
  ])

  return {
    code: code.code,
    link: `${APP_ORIGIN}/ref/${code.code}`,
    qualifiedCount,
    nextTier: REFERRER_TIERS.slice().reverse().find((tier) => qualifiedCount < tier.minimumQualifiedReferrals) ?? null,
    rewards,
  }
}
