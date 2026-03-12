import type { ProjectAiBudgetDto } from "@relay/shared"
import type { RepositoryBundle } from "@relay/db"

const FREE_PLAN = {
  plan: "free" as const,
  dailyUserAiLimit: 24,
  dailyProjectAiLimit: 8,
  minProjectAiSpacingMinutes: 12
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000)
}

export async function resolveProjectAiBudget(
  repositories: RepositoryBundle,
  userId: string,
  projectId: string
): Promise<ProjectAiBudgetDto> {
  const [dailyProjectAiUsed, dailyUserAiUsed, latestProjectRun] = await Promise.all([
    repositories.aiJobs.countRecentAiDigestRunsByProject(projectId),
    repositories.aiJobs.countRecentAiDigestRunsByUser(userId),
    repositories.aiJobs.getLatestAiDigestRunByProject(projectId)
  ])

  let aiEligible = true
  let reason: string | null = null
  let nextAiAllowedAt: string | null = null

  if (dailyUserAiUsed >= FREE_PLAN.dailyUserAiLimit) {
    aiEligible = false
    reason = "Daily AI budget reached for this account."
  } else if (dailyProjectAiUsed >= FREE_PLAN.dailyProjectAiLimit) {
    aiEligible = false
    reason = "Daily AI budget reached for this project."
  } else if (latestProjectRun?.createdAt) {
    const nextWindow = addMinutes(new Date(latestProjectRun.createdAt), FREE_PLAN.minProjectAiSpacingMinutes)
    if (nextWindow.getTime() > Date.now()) {
      aiEligible = false
      reason = "Relay is spacing out AI digests for this project."
      nextAiAllowedAt = nextWindow.toISOString()
    }
  }

  return {
    plan: FREE_PLAN.plan,
    aiEligible,
    reason,
    dailyProjectAiUsed,
    dailyProjectAiLimit: FREE_PLAN.dailyProjectAiLimit,
    dailyUserAiUsed,
    dailyUserAiLimit: FREE_PLAN.dailyUserAiLimit,
    nextAiAllowedAt
  }
}
