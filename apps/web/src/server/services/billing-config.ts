import type { BillingPlanKey, EntitlementLimitsDto, UserEntitlementsDto } from "@relay/shared"

export const FREE_LIMITS: EntitlementLimitsDto = {
  activeProjects: 2,
  historyRetentionDays: 30,
  captureMonthly: 200,
  mcpReadDaily: 20,
  mcpWriteDaily: 5,
}

export const PRO_LIMITS: EntitlementLimitsDto = {
  activeProjects: 10,
  historyRetentionDays: 365,
  captureMonthly: 2000,
  mcpReadDaily: 200,
  mcpWriteDaily: 50,
}

export const PLAN_PRODUCT_IDS = {
  pro: {
    month: process.env["POLAR_PRODUCT_ID_PRO_MONTHLY"] ?? "",
    year: process.env["POLAR_PRODUCT_ID_PRO_ANNUAL"] ?? "",
  },
} as const

export function getPlanLimits(plan: BillingPlanKey): EntitlementLimitsDto {
  return plan === "pro" ? PRO_LIMITS : FREE_LIMITS
}

export function getDefaultEntitlements(): UserEntitlementsDto {
  return {
    plan: "free",
    status: "inactive",
    interval: null,
    isPro: false,
    isTrialing: false,
    trialEndsAt: null,
    currentPeriodEnd: null,
    features: {
      browserCapture: true,
      mcpRead: true,
      mcpWrite: true,
      handoffPacks: false,
    },
    limits: FREE_LIMITS,
  }
}

const appUrl = process.env["NEXT_PUBLIC_RELAY_APP_URL"] ?? "https://www.onrelay.app"
export const BILLING_SUCCESS_URL = `${appUrl}/settings?section=billing&checkout=success`
export const BILLING_RETURN_URL = `${appUrl}/settings?section=billing`
