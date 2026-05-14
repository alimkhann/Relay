import type { BillingPlanKey, EntitlementLimitsDto, UserEntitlementsDto } from "@relay/shared"

export const FREE_LIMITS: EntitlementLimitsDto = {
  activeProjects: 2,
  historyRetentionDays: 14,
  captureMonthly: 40,
  mcpReadDaily: 5,
  mcpDeepReadDaily: 1,
  mcpWriteDaily: 1,
  aiAnalysesPerProjectDaily: 2,
  aiAnalysesPerUserDaily: 2,
  memoryItemsPerProject: 100,
  sourcesPerProject: 3,
  sourceFileMaxBytes: 10 * 1024 * 1024,
  sourceStorageBytes: 50 * 1024 * 1024,
  sourceEmbeddedTokensMonthly: 25_000,
  sourceIngestionsDaily: 3,
  sourceBackedRecallDaily: 3,
  sourceOcrPagesMonthly: 0,
}

export const STARTER_LIMITS: EntitlementLimitsDto = {
  activeProjects: 5,
  historyRetentionDays: 3650,
  captureMonthly: 500,
  mcpReadDaily: 120,
  mcpDeepReadDaily: 8,
  mcpWriteDaily: 20,
  aiAnalysesPerProjectDaily: 25,
  aiAnalysesPerUserDaily: 25,
  memoryItemsPerProject: 1000,
  sourcesPerProject: 25,
  sourceFileMaxBytes: 50 * 1024 * 1024,
  sourceStorageBytes: 1024 * 1024 * 1024,
  sourceEmbeddedTokensMonthly: 500_000,
  sourceIngestionsDaily: 25,
  sourceBackedRecallDaily: 50,
  sourceOcrPagesMonthly: 0,
}

export const PRO_LIMITS: EntitlementLimitsDto = {
  activeProjects: 15,
  historyRetentionDays: 3650,
  captureMonthly: 1000,
  mcpReadDaily: 300,
  mcpDeepReadDaily: 20,
  mcpWriteDaily: 60,
  aiAnalysesPerProjectDaily: 60,
  aiAnalysesPerUserDaily: 60,
  memoryItemsPerProject: 5000,
  sourcesPerProject: 100,
  sourceFileMaxBytes: 100 * 1024 * 1024,
  sourceStorageBytes: 5 * 1024 * 1024 * 1024,
  sourceEmbeddedTokensMonthly: 2_000_000,
  sourceIngestionsDaily: 100,
  sourceBackedRecallDaily: 200,
  sourceOcrPagesMonthly: 0,
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
  { label: "Source retention", key: "historyRetentionDays" },
  { label: "MCP basic reads / day", key: "mcpReadDaily" },
  { label: "MCP deep reads / day", key: "mcpDeepReadDaily" },
  { label: "MCP writes / day", key: "mcpWriteDaily" },
  { label: "AI analyses / day", key: "aiAnalysesPerUserDaily" },
  { label: "Memory items / project", key: "memoryItemsPerProject" },
  { label: "Sources / project", key: "sourcesPerProject" },
] as const

export const PLAN_MARKETING_COPY = {
  free: {
    features: [
      `Up to ${FREE_LIMITS.activeProjects} active projects`,
      `${formatNumber(FREE_LIMITS.mcpReadDaily)} MCP reads + ${formatNumber(FREE_LIMITS.mcpDeepReadDaily)} deep reads / day`,
      `${FREE_LIMITS.historyRetentionDays}-day source retention, ${formatNumber(FREE_LIMITS.captureMonthly)} captures / month`,
      "Browser capture across supported AI tools",
      `${FREE_LIMITS.sourcesPerProject} source imports / project`,
      "Basic context briefs",
    ],
  },
  starter: {
    features: [
      `Up to ${STARTER_LIMITS.activeProjects} active projects`,
      `${formatNumber(STARTER_LIMITS.mcpReadDaily)} MCP reads + ${formatNumber(STARTER_LIMITS.mcpDeepReadDaily)} deep reads / day`,
      `${formatNumber(STARTER_LIMITS.captureMonthly)} captures / month across all projects`,
      "Autonomous context updates",
      `${STARTER_LIMITS.sourcesPerProject} source imports / project`,
      "Full + continuity briefs",
    ],
  },
  pro: {
    features: [
      `Up to ${PRO_LIMITS.activeProjects} active projects`,
      `${formatNumber(PRO_LIMITS.mcpReadDaily)} MCP reads + ${formatNumber(PRO_LIMITS.mcpDeepReadDaily)} deep reads / day`,
      `${formatNumber(PRO_LIMITS.captureMonthly)} captures / month across all projects`,
      "High-quality model for reflections",
      `${PRO_LIMITS.sourcesPerProject} source imports / project`,
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
export const BILLING_WALKTHROUGH_SUCCESS_URL = `${appUrl}/dashboard?walkthrough=extension`
export const BILLING_RETURN_URL = `${appUrl}/settings?section=billing`
