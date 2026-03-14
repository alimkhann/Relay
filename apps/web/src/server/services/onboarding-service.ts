import { createRepositoryBundle } from "@relay/db"
import type {
  RelayOnboardingCompletionSurface,
  RelayOnboardingState,
  RelayOnboardingStatus,
  UserOnboardingRow
} from "@relay/shared"

function toState(row: UserOnboardingRow): RelayOnboardingState {
  return {
    status: row.status,
    completedProjectId: row.completedProjectId,
    completedVia: row.completedVia,
    completedAt: row.completedAt
  }
}

export function createPendingOnboardingState(): RelayOnboardingState {
  return {
    status: "pending",
    completedProjectId: null,
    completedVia: null,
    completedAt: null
  }
}

export async function setOnboardingState(input: {
  userId: string
  status: RelayOnboardingStatus
  completedProjectId?: string | null
  completedVia?: RelayOnboardingCompletionSurface | null
  completedAt?: string | null
}) {
  const repositories = createRepositoryBundle(input.userId)
  return toState(
    await repositories.userOnboarding.upsert({
      userId: input.userId,
      status: input.status,
      completedProjectId: input.completedProjectId ?? null,
      completedVia: input.completedVia ?? null,
      completedAt: input.completedAt ?? null
    })
  )
}

export async function completeOnboardingForUser(
  userId: string,
  projectId: string,
  via: RelayOnboardingCompletionSurface
) {
  return setOnboardingState({
    userId,
    status: "completed",
    completedProjectId: projectId,
    completedVia: via,
    completedAt: new Date().toISOString()
  })
}

export async function getResolvedOnboardingStateForUser(
  userId: string,
  options: {
    projects?: Array<{ id: string }>
  } = {}
) {
  const repositories = createRepositoryBundle(userId)
  const existing = await repositories.userOnboarding.getByUser(userId)

  if (existing?.status === "completed") {
    return toState(existing)
  }

  const projects = options.projects ?? (await repositories.projects.listByOwner(userId))

  if (projects.length > 0) {
    const completedProjectId = existing?.completedProjectId ?? projects[0]?.id ?? null
    return await setOnboardingState({
      userId,
      status: "completed",
      completedProjectId,
      completedVia: existing?.completedVia ?? null,
      completedAt: existing?.completedAt ?? new Date().toISOString()
    })
  }

  if (existing) {
    return toState(existing)
  }

  return await setOnboardingState({
    userId,
    status: "pending"
  })
}
