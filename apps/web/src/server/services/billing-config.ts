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

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

export const PLAN_LIMIT_ROWS = [
  { label: "Active projects", key: "activeProjects" },
  { label: "Captures / month", key: "captureMonthly" },
  { label: "Retention", key: "historyRetentionDays" },
  { label: "MCP basic reads / day", key: "mcpReadDaily" },
  { label: "MCP deep reads / day", key: "mcpDeepReadDaily" },
  { label: "MCP writes / day", key: "mcpWriteDaily" },
  { label: "AI analyses / day", key: "aiAnalysesPerUserDaily" },
  { label: "Memory items / project", key: "memoryItemsPerProject" },
] as const

export const PLAN_MARKETING_COPY = {
  free: {
    features: [
      `Up to ${FREE_LIMITS.activeProjects} active projects`,
      `${formatNumber(FREE_LIMITS.mcpReadDaily)} MCP reads + ${formatNumber(FREE_LIMITS.mcpDeepReadDaily)} deep reads / day`,
      `${FREE_LIMITS.historyRetentionDays}-day retention, ${formatNumber(FREE_LIMITS.captureMonthly)} captures / month`,
      "Browser capture across supported AI tools",
      "Basic context briefs",
    ],
  },
  starter: {
    features: [
      `Up to ${STARTER_LIMITS.activeProjects} active projects`,
      `${formatNumber(STARTER_LIMITS.mcpReadDaily)} MCP reads + ${formatNumber(STARTER_LIMITS.mcpDeepReadDaily)} deep reads / day`,
      `${STARTER_LIMITS.historyRetentionDays}-day retention, ${formatNumber(STARTER_LIMITS.captureMonthly)} captures / month`,
      "Autonomous context updates",
      "Full + continuity briefs",
    ],
  },
  pro: {
    features: [
      `Up to ${PRO_LIMITS.activeProjects} active projects`,
      `${formatNumber(PRO_LIMITS.mcpReadDaily)} MCP reads + ${formatNumber(PRO_LIMITS.mcpDeepReadDaily)} deep reads / day`,
      `${PRO_LIMITS.historyRetentionDays}-day retention, ${formatNumber(PRO_LIMITS.captureMonthly)} captures / month`,
      "High-quality model for reflections",
      "Aggressive autonomy + conflict resolution",
      "Priority support",
    ],
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
