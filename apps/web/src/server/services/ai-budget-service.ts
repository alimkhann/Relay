import type { ProjectAiBudgetDto } from "@relay/shared"
import type { RepositoryBundle } from "@relay/db"

import { resolveViewerEntitlements } from "./entitlement-service"

const FREE_PLAN = {
  plan: "free" as const,
  dailyUserAiLimit: 24,
  dailyProjectAiLimit: 8,
  minProjectAiSpacingMinutes: 12
}

const PRO_PLAN = {
  plan: "pro" as const,
  dailyUserAiLimit: 120,
  dailyProjectAiLimit: 32,
  minProjectAiSpacingMinutes: 3,
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000)
}

export async function resolveProjectAiBudget(
  repositories: RepositoryBundle,
  userId: string,
  projectId: string
): Promise<ProjectAiBudgetDto> {
  const entitlements = await resolveViewerEntitlements(userId)
  const planConfig = entitlements.plan === "pro" ? PRO_PLAN : FREE_PLAN
  const [dailyProjectAiUsed, dailyUserAiUsed, latestProjectRun] = await Promise.all([
    repositories.aiJobs.countRecentAiDigestRunsByProject(projectId),
    repositories.aiJobs.countRecentAiDigestRunsByUser(userId),
    repositories.aiJobs.getLatestAiDigestRunByProject(projectId)
  ])

  let aiEligible = true
  let reason: string | null = null
  let nextAiAllowedAt: string | null = null

  if (dailyUserAiUsed >= planConfig.dailyUserAiLimit) {
    aiEligible = false
    reason = "Daily AI budget reached for this account."
  } else if (dailyProjectAiUsed >= planConfig.dailyProjectAiLimit) {
    aiEligible = false
    reason = "Daily AI budget reached for this project."
  } else if (latestProjectRun?.createdAt) {
    const nextWindow = addMinutes(new Date(latestProjectRun.createdAt), planConfig.minProjectAiSpacingMinutes)
    if (nextWindow.getTime() > Date.now()) {
      aiEligible = false
      reason = "Relay is spacing out AI digests for this project."
      nextAiAllowedAt = nextWindow.toISOString()
    }
  }

  return {
    plan: planConfig.plan,
    aiEligible,
    reason,
    dailyProjectAiUsed,
    dailyProjectAiLimit: planConfig.dailyProjectAiLimit,
    dailyUserAiUsed,
    dailyUserAiLimit: planConfig.dailyUserAiLimit,
    nextAiAllowedAt
  }
}
