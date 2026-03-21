import type { ProjectAiBudgetDto } from "@relay/shared"
import type { RepositoryBundle } from "@relay/db"

import { resolveViewerEntitlements } from "./entitlement-service"

const FREE_PLAN = {
  plan: "free" as const,
  dailyUserAiLimit: 18,
  dailyProjectAiLimit: 6,
}

const PRO_PLAN = {
  plan: "pro" as const,
  dailyUserAiLimit: 120,
  dailyProjectAiLimit: 32,
}

export async function resolveProjectAiBudget(
  repositories: RepositoryBundle,
  userId: string,
  projectId: string
): Promise<ProjectAiBudgetDto> {
  const entitlements = await resolveViewerEntitlements(userId)
  const planConfig = entitlements.plan === "pro" ? PRO_PLAN : FREE_PLAN
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
