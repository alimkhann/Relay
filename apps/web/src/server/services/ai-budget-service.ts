import type { ProjectAiBudgetDto, UserEntitlementsDto } from "@relay/shared"
import type { RepositoryBundle } from "@relay/db"

import { resolveViewerEntitlements } from "./entitlement-service"

function planBudgetFromEntitlements(entitlements: UserEntitlementsDto) {
  return {
    plan: entitlements.plan,
    dailyUserAiLimit: entitlements.limits.aiAnalysesPerUserDaily,
    dailyProjectAiLimit: entitlements.limits.aiAnalysesPerProjectDaily,
  }
}

export async function resolveProjectAiBudget(
  repositories: RepositoryBundle,
  userId: string,
  projectId: string
): Promise<ProjectAiBudgetDto> {
  const entitlements = await resolveViewerEntitlements(userId)
  const planConfig = planBudgetFromEntitlements(entitlements)
  const [dailyProjectAiUsed, dailyUserAiUsed] = await Promise.all([
    repositories.aiJobs.countRecentAiDigestRunsByProject(projectId),
    repositories.aiJobs.countRecentAiDigestRunsByUser(userId),
  ])

  let aiEligible = true
  let reason: string | null = null

  if (dailyUserAiUsed >= planConfig.dailyUserAiLimit) {
    aiEligible = false
    reason = "Daily AI budget reached for this account."
  } else if (dailyProjectAiUsed >= planConfig.dailyProjectAiLimit) {
    aiEligible = false
    reason = "Daily AI budget reached for this project."
  }

  return {
    plan: planConfig.plan,
    aiEligible,
    reason,
    dailyProjectAiUsed,
    dailyProjectAiLimit: planConfig.dailyProjectAiLimit,
    dailyUserAiUsed,
    dailyUserAiLimit: planConfig.dailyUserAiLimit,
    dailyProjectAiRemaining: Math.max(0, planConfig.dailyProjectAiLimit - dailyProjectAiUsed),
    dailyUserAiRemaining: Math.max(0, planConfig.dailyUserAiLimit - dailyUserAiUsed),
    nextAiAllowedAt: null
  }
}
