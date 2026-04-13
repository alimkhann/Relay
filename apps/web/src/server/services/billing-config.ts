import type { BillingPlanKey, EntitlementLimitsDto, UserEntitlementsDto } from "@relay/shared"

export const FREE_LIMITS: EntitlementLimitsDto = {
  activeProjects: 2,
  historyRetentionDays: 7,
  captureMonthly: 100,
  mcpReadDaily: 12,
  mcpDeepReadDaily: 2,
  mcpWriteDaily: 1,
  aiAnalysesPerProjectDaily: 2,
  aiAnalysesPerUserDaily: 4,
  memoryItemsPerProject: 150,
}

export const STARTER_LIMITS: EntitlementLimitsDto = {
  activeProjects: 10,
  historyRetentionDays: 180,
  captureMonthly: 1200,
  mcpReadDaily: 200,
  mcpDeepReadDaily: 12,
  mcpWriteDaily: 15,
  aiAnalysesPerProjectDaily: 8,
  aiAnalysesPerUserDaily: 40,
  memoryItemsPerProject: 1500,
}

export const PRO_LIMITS: EntitlementLimitsDto = {
  activeProjects: 20,
  historyRetentionDays: 365,
  captureMonthly: 3000,
  mcpReadDaily: 500,
  mcpDeepReadDaily: 30,
  mcpWriteDaily: 40,
  aiAnalysesPerProjectDaily: 18,
  aiAnalysesPerUserDaily: 90,
  memoryItemsPerProject: 4000,
}

export const PLAN_PRODUCT_IDS = {
  starter: {
    month: process.env["POLAR_PRODUCT_ID_STARTER_MONTHLY"] ?? "",
    year: process.env["POLAR_PRODUCT_ID_STARTER_ANNUAL"] ?? "",
  },
  pro: {
    month: process.env["POLAR_PRODUCT_ID_PRO_MONTHLY"] ?? "",
    year: process.env["POLAR_PRODUCT_ID_PRO_ANNUAL"] ?? "",
  },
} as const

export function getPlanLimits(plan: BillingPlanKey): EntitlementLimitsDto {
  if (plan === "pro") return PRO_LIMITS
  if (plan === "starter") return STARTER_LIMITS
  return FREE_LIMITS
}

export function getDefaultEntitlements(): UserEntitlementsDto {
  return {
    plan: "free",
    status: "inactive",
    interval: null,
    isPaid: false,
    isPro: false,
    isTrialing: false,
    trialEndsAt: null,
    currentPeriodEnd: null,
    features: {
      browserCapture: true,
      mcpRead: true,
      mcpWrite: true,
      handoffPacks: false,
      autonomousCanon: false,
      highQualityModel: false,
    },
    limits: FREE_LIMITS,
  }
}

const appUrl = process.env["NEXT_PUBLIC_RELAY_APP_URL"] ?? "https://www.onrelay.app"
export const BILLING_SUCCESS_URL = `${appUrl}/settings?section=billing&checkout=success`
export const BILLING_RETURN_URL = `${appUrl}/settings?section=billing`
