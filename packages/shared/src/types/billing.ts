export type BillingPlanKey = "free" | "starter" | "pro"
export type BillingInterval = "month" | "year" | null
export type BillingSubscriptionStatus = "inactive" | "trialing" | "active" | "past_due" | "canceled"

export interface EntitlementLimitsDto {
  activeProjects: number
  historyRetentionDays: number
  readsMonthly: number
  readsDaily: number
  writesMonthly: number
  writesDaily: number
  /** Legacy compatibility aliases for older extension/web clients. */
  captureMonthly: number
  mcpReadDaily: number
  mcpDeepReadDaily: number
  mcpWriteDaily: number
  aiAnalysesPerProjectDaily: number
  aiAnalysesPerUserDaily: number
  memoryItemsPerProject: number
  sourcesPerProject: number
  sourceFileMaxBytes: number
  sourceStorageBytes: number
  sourceEmbeddedTokensMonthly: number
  sourceIngestionsDaily: number
  sourceBackedRecallDaily: number
  sourceOcrPagesMonthly: number
  externalSourcesPerProject: number
  externalSourcePagesPerSource: number
  externalSourceIndexesDaily: number
  externalSourceSearchesDaily: number
  externalSourceRefreshesDaily: number
  externalSourceMcpActionsPerMinute: number
  assistantMessagesMonthly: number
  assistantMessagesDaily: number
  assistantTokensMonthly: number
  assistantMaxSteps: number
}

export interface UserEntitlementsDto {
  plan: BillingPlanKey
  status: BillingSubscriptionStatus
  interval: BillingInterval
  isPaid: boolean
  isPro: boolean
  isTrialing: boolean
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  features: {
    browserCapture: boolean
    mcpRead: boolean
    mcpWrite: boolean
    handoffPacks: boolean
    autonomousCanon: boolean
    highQualityModel: boolean
  }
  limits: EntitlementLimitsDto
}

export interface BillingStatusDto {
  entitlements: UserEntitlementsDto
  subscription: {
    providerSubscriptionId: string
    plan: BillingPlanKey
    status: BillingSubscriptionStatus
    interval: BillingInterval
    cancelAtPeriodEnd: boolean
    currentPeriodEnd: string | null
  } | null
  customer: {
    providerCustomerId: string | null
    email: string | null
    name: string | null
  }
  usage: {
    capturesThisMonth: number
    mcpReadsToday: number
    mcpWritesToday: number
    readsToday: number
    readsThisMonth: number
    writesToday: number
    writesThisMonth: number
    handoffsThisMonth: number
    activeProjects: number
    aiAnalysesToday: number
    sourceIngestionsToday: number
    sourceEmbeddedTokensThisMonth: number
    sourceBackedRecallsToday: number
    externalSourceIndexesToday: number
    externalSourceSearchesToday: number
    externalSourceRefreshesToday: number
    assistantMessagesThisMonth: number
    assistantTokensThisMonth: number
  }
}
