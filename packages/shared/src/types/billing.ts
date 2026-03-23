export type BillingPlanKey = "free" | "pro"
export type BillingInterval = "month" | "year" | null
export type BillingSubscriptionStatus = "inactive" | "trialing" | "active" | "past_due" | "canceled"

export interface EntitlementLimitsDto {
  activeProjects: number
  historyRetentionDays: number
  captureMonthly: number
  mcpReadDaily: number
  mcpWriteDaily: number
  aiAnalysesPerProjectDaily: number
  aiAnalysesPerUserDaily: number
}

export interface UserEntitlementsDto {
  plan: BillingPlanKey
  status: BillingSubscriptionStatus
  interval: BillingInterval
  isPro: boolean
  isTrialing: boolean
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  features: {
    browserCapture: boolean
    mcpRead: boolean
    mcpWrite: boolean
    handoffPacks: boolean
  }
  limits: EntitlementLimitsDto
}

export interface BillingStatusDto {
  entitlements: UserEntitlementsDto
  customer: {
    providerCustomerId: string | null
    email: string | null
    name: string | null
  }
  usage: {
    capturesThisMonth: number
    mcpReadsToday: number
    mcpWritesToday: number
    handoffsThisMonth: number
    activeProjects: number
    aiAnalysesToday: number
  }
}
