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
  externalSourcesPerProject: 1,
  externalSourcePagesPerSource: 25,
  externalSourceIndexesDaily: 1,
  externalSourceSearchesDaily: 3,
  externalSourceRefreshesDaily: 0,
  externalSourceMcpActionsPerMinute: 5,
  // Free is a paywalled taste of Ask Relay: a small monthly allowance then upgrade.
  assistantMessagesMonthly: 10,
  assistantMessagesDaily: 10,
  assistantTokensMonthly: 60_000,
  assistantMaxSteps: 4,
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
  externalSourcesPerProject: 10,
  externalSourcePagesPerSource: 250,
  externalSourceIndexesDaily: 10,
  externalSourceSearchesDaily: 50,
  externalSourceRefreshesDaily: 5,
  externalSourceMcpActionsPerMinute: 20,
  assistantMessagesMonthly: 3_000,
  assistantMessagesDaily: 100,
  assistantTokensMonthly: 2_000_000,
  assistantMaxSteps: 6,
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
  externalSourcesPerProject: 50,
  externalSourcePagesPerSource: 1000,
  externalSourceIndexesDaily: 40,
  externalSourceSearchesDaily: 200,
  externalSourceRefreshesDaily: 25,
  externalSourceMcpActionsPerMinute: 60,
  assistantMessagesMonthly: 12_000,
  assistantMessagesDaily: 400,
  assistantTokensMonthly: 8_000_000,
  assistantMaxSteps: 8,
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
  { label: "External sources / project", key: "externalSourcesPerProject" },
  { label: "External source searches / day", key: "externalSourceSearchesDaily" },
] as const

export const PLAN_MARKETING_COPY = {
  free: {
    features: [
      `Up to ${FREE_LIMITS.activeProjects} projects to keep your work organized`,
      `${formatNumber(FREE_LIMITS.mcpReadDaily)} MCP reads + ${formatNumber(FREE_LIMITS.mcpDeepReadDaily)} deep reads / day`,
      `Keeps history for ${FREE_LIMITS.historyRetentionDays} days · ${formatNumber(FREE_LIMITS.captureMonthly)} captures / month`,
      "One-click capture from ChatGPT, Claude & more",
      `Add up to ${FREE_LIMITS.sourcesPerProject} of your own docs per project`,
      `${FREE_LIMITS.externalSourcesPerProject} linked website or repo per project`,
      "Context briefs to pick up where you left off",
      `${formatNumber(FREE_LIMITS.assistantMessagesMonthly)} Ask Relay AI messages / month`,
    ],
  },
  starter: {
    features: [
      `Up to ${STARTER_LIMITS.activeProjects} projects to keep your work organized`,
      `${formatNumber(STARTER_LIMITS.mcpReadDaily)} MCP reads + ${formatNumber(STARTER_LIMITS.mcpDeepReadDaily)} deep reads / day`,
      `${formatNumber(STARTER_LIMITS.captureMonthly)} captures / month across every project`,
      "Relay keeps your project context up to date automatically",
      `Add up to ${STARTER_LIMITS.sourcesPerProject} of your own docs per project`,
      `${STARTER_LIMITS.externalSourcesPerProject} linked websites or repos per project`,
      "Richer briefs that carry continuity between sessions",
      "Daily Ask Relay AI allowance (no monthly cap)",
    ],
  },
  pro: {
    features: [
      `Up to ${PRO_LIMITS.activeProjects} projects to keep your work organized`,
      `${formatNumber(PRO_LIMITS.mcpReadDaily)} MCP reads + ${formatNumber(PRO_LIMITS.mcpDeepReadDaily)} deep reads / day`,
      `${formatNumber(PRO_LIMITS.captureMonthly)} captures / month across every project`,
      "Highest-quality AI model for summaries and reflections",
      `Add up to ${PRO_LIMITS.sourcesPerProject} of your own docs per project`,
      `${PRO_LIMITS.externalSourcesPerProject} linked websites or repos per project`,
      "Most proactive context updates with conflict resolution",
      "Highest Ask Relay AI allowance + priority support",
    ],
  },
} as const

/**
 * Plain-language explanations of Relay terms for non-technical visitors.
 * Term names are intentionally unchanged; only the explanation is friendly.
 */
export const PLAN_GLOSSARY = [
  {
    term: "Captures",
    plain: "Snippets you save from an AI chat (ChatGPT, Claude, etc.) so Relay can remember them.",
  },
  {
    term: "MCP reads / writes",
    plain:
      "When a connected AI coding tool reads your saved context or writes new context back. A “deep read” pulls a fuller briefing.",
  },
  {
    term: "Sources",
    plain: "Your own documents, websites, or repos you attach to a project for Relay to reference.",
  },
  {
    term: "Briefs",
    plain: "A short, ready-to-paste summary of where a project stands so you can resume instantly.",
  },
  {
    term: "Ask Relay",
    plain:
      "The built-in AI assistant that can answer questions and act on your projects, memory, and briefs for you.",
  },
] as const

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
