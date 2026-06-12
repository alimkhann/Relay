import type { BillingPlanKey, EntitlementLimitsDto, UserEntitlementsDto } from "@relay/shared"

export const FREE_LIMITS: EntitlementLimitsDto = {
  activeProjects: 2,
  historyRetentionDays: 14,
  readsMonthly: 60,
  readsDaily: 15,
  writesMonthly: 20,
  writesDaily: 5,
  captureMonthly: 20,
  mcpReadDaily: 15,
  mcpDeepReadDaily: 1,
  mcpWriteDaily: 5,
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
  assistantMessagesMonthly: 8,
  assistantMessagesDaily: 3,
  assistantTokensMonthly: 50_000,
  // Free turns are intentionally bounded so a few useful actions demonstrate
  // value without allowing long unattended agent runs.
  assistantMaxSteps: 6,
}

export const STARTER_LIMITS: EntitlementLimitsDto = {
  activeProjects: 5,
  historyRetentionDays: 3650,
  readsMonthly: 1_000,
  readsDaily: 100,
  writesMonthly: 500,
  writesDaily: 50,
  captureMonthly: 500,
  mcpReadDaily: 100,
  mcpDeepReadDaily: 8,
  mcpWriteDaily: 50,
  aiAnalysesPerProjectDaily: 25,
  aiAnalysesPerUserDaily: 25,
  memoryItemsPerProject: 1000,
  sourcesPerProject: 15,
  sourceFileMaxBytes: 50 * 1024 * 1024,
  sourceStorageBytes: 1024 * 1024 * 1024,
  sourceEmbeddedTokensMonthly: 500_000,
  sourceIngestionsDaily: 25,
  sourceBackedRecallDaily: 50,
  sourceOcrPagesMonthly: 0,
  externalSourcesPerProject: 5,
  externalSourcePagesPerSource: 250,
  externalSourceIndexesDaily: 10,
  externalSourceSearchesDaily: 50,
  externalSourceRefreshesDaily: 5,
  externalSourceMcpActionsPerMinute: 20,
  assistantMessagesMonthly: 150,
  assistantMessagesDaily: 20,
  assistantTokensMonthly: 500_000,
  assistantMaxSteps: 12,
}

export const PRO_LIMITS: EntitlementLimitsDto = {
  activeProjects: 15,
  historyRetentionDays: 3650,
  readsMonthly: 3_000,
  readsDaily: 300,
  writesMonthly: 1_500,
  writesDaily: 150,
  captureMonthly: 1500,
  mcpReadDaily: 300,
  mcpDeepReadDaily: 20,
  mcpWriteDaily: 150,
  aiAnalysesPerProjectDaily: 60,
  aiAnalysesPerUserDaily: 60,
  memoryItemsPerProject: 5000,
  sourcesPerProject: 50,
  sourceFileMaxBytes: 100 * 1024 * 1024,
  sourceStorageBytes: 5 * 1024 * 1024 * 1024,
  sourceEmbeddedTokensMonthly: 2_000_000,
  sourceIngestionsDaily: 100,
  sourceBackedRecallDaily: 200,
  sourceOcrPagesMonthly: 0,
  externalSourcesPerProject: 20,
  externalSourcePagesPerSource: 1000,
  externalSourceIndexesDaily: 40,
  externalSourceSearchesDaily: 200,
  externalSourceRefreshesDaily: 25,
  externalSourceMcpActionsPerMinute: 60,
  assistantMessagesMonthly: 600,
  assistantMessagesDaily: 60,
  assistantTokensMonthly: 2_000_000,
  assistantMaxSteps: 20,
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
  { label: "Reads / month", key: "readsMonthly" },
  { label: "Reads / day", key: "readsDaily" },
  { label: "Writes / month", key: "writesMonthly" },
  { label: "Writes / day", key: "writesDaily" },
  { label: "Source retention", key: "historyRetentionDays" },
  { label: "AI analyses / day", key: "aiAnalysesPerUserDaily" },
  { label: "Memory items / project", key: "memoryItemsPerProject" },
  { label: "Sources / project", key: "sourcesPerProject" },
  { label: "External sources / project", key: "externalSourcesPerProject" },
  { label: "External source searches / day", key: "externalSourceSearchesDaily" },
] as const

// Cards sell OUTCOMES, not quota tables — exact limits live on /docs/plans.
export const PLAN_MARKETING_COPY = {
  free: {
    features: [
      "Try Relay memory with your AI chats",
      `${FREE_LIMITS.activeProjects} projects to keep your work organized`,
      "One-click capture from ChatGPT, Claude & more",
      "MCP for Claude Code, Cursor & coding agents",
      "Enough reads & writes to feel the difference",
    ],
  },
  starter: {
    features: [
      "Never re-explain a project to your AI again",
      `${STARTER_LIMITS.activeProjects} projects with long-term memory`,
      "Context updates itself as you work — automatically",
      "Richer briefs that carry continuity between sessions",
      "Enough usage for daily AI work, every day",
    ],
  },
  pro: {
    features: [
      "Everything in Starter, with the most headroom",
      `${PRO_LIMITS.activeProjects} projects, highest limits everywhere`,
      "Highest-quality AI model for summaries and briefs",
      "Most proactive updates with conflict resolution",
      "Relay agent without thinking about quotas",
    ],
  },
} as const

/**
 * Plain-language explanations of Relay terms for non-technical visitors.
 * Term names are intentionally unchanged; only the explanation is friendly.
 */
export const PLAN_GLOSSARY = [
  {
    term: "Writes",
    plain: "Captures and explicit changes that save, update, move, or delete Relay context. Batch changes count the items changed.",
  },
  {
    term: "Reads",
    plain:
      "Explicit requests that retrieve saved Relay context, including MCP calls and Relay agent retrieval turns.",
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
