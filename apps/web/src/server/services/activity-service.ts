import {
  createRepositoryBundle,
  getProjectDashboard,
  getProjectSummaries,
  type GroupedSessionResult,
} from "@relay/db"

import type { ProjectDashboardDto, SupportedPlatform } from "@relay/shared"

export interface ActivityEntry {
  kind: "capture" | "digest"
  projectId: string
  projectName: string
  sessionId?: string
  title: string
  detail: string
  timestamp: string
  isArchived?: boolean
}

/** Grouped activity entry for compressed activity view */
export interface GroupedActivityEntry {
  kind: "capture-group" | "digest"
  projectId: string
  projectName: string
  /** For capture-group: conversation ID; for digest: digest ID */
  groupId: string
  /** Platform for the conversation */
  platform: SupportedPlatform
  title: string
  detail: string
  /** Most recent timestamp in the group */
  timestamp: string
  /** Number of captures in this group (1 for digest) */
  captureCount: number
  /** Total turns across all captures */
  totalTurns: number
  /** All session IDs in the group */
  sessionIds: string[]
  /** Whether all sessions in group are archived */
  allArchived: boolean
}

export function buildActivityFeed(
  projects: { id: string; name: string }[],
  dashboards: (ProjectDashboardDto | null)[],
): ActivityEntry[] {
  const entries: ActivityEntry[] = []

  dashboards.forEach((dashboard, index) => {
    if (!dashboard) return
    const project = projects[index]
    if (!project) return

    for (const session of dashboard.sessionHistory) {
      entries.push({
        kind: "capture",
        projectId: project.id,
        projectName: project.name,
        sessionId: session.id,
        title: session.title ?? session.url,
        detail: `${session.platform} · ${session.turnCount} turns${session.isArchived ? " · detached" : ""}`,
        timestamp: session.capturedAt ?? "",
        isArchived: session.isArchived,
      })
    }

    for (const digest of dashboard.recentDigests) {
      entries.push({
        kind: "digest",
        projectId: project.id,
        projectName: project.name,
        title: digest.summaryShort ?? "Digest run",
        detail: `confidence ${Math.round((digest.confidence ?? 0) * 100)}%${digest.shouldMerge ? " · merged" : ""}`,
        timestamp: digest.createdAt ?? "",
      })
    }
  })

  // Group by project, then sort by recency within each project
  entries.sort((a, b) => {
    if (a.projectName !== b.projectName) return a.projectName.localeCompare(b.projectName)
    return b.timestamp > a.timestamp ? 1 : -1
  })
  return entries.slice(0, 50)
}

/**
 * Build a grouped activity feed from grouped session results.
 * Compresses multiple captures from the same conversation into a single entry.
 */
export function buildGroupedActivityFeed(
  projectId: string,
  projectName: string,
  groupedSessions: GroupedSessionResult[],
  digests: ProjectDashboardDto["recentDigests"] = [],
): GroupedActivityEntry[] {
  const entries: GroupedActivityEntry[] = []

  // Add grouped capture entries
  for (const group of groupedSessions) {
    const captureLabel = group.captureCount === 1 ? "capture" : "captures"
    entries.push({
      kind: "capture-group",
      projectId,
      projectName,
      groupId: group.conversationId,
      platform: group.platform,
      title: group.title ?? group.url,
      detail: `${group.captureCount} ${captureLabel} · ${group.totalTurns} turns${group.allArchived ? " · detached" : ""}`,
      timestamp: group.lastCapturedAt,
      captureCount: group.captureCount,
      totalTurns: group.totalTurns,
      sessionIds: group.sessionIds,
      allArchived: group.allArchived,
    })
  }

  // Add digest entries
  for (const digest of digests) {
    entries.push({
      kind: "digest",
      projectId,
      projectName,
      groupId: digest.id,
      platform: "chatgpt", // Digests aren't platform-specific, using default
      title: digest.summaryShort ?? "Digest run",
      detail: `confidence ${Math.round((digest.confidence ?? 0) * 100)}%${digest.shouldMerge ? " · merged" : ""}`,
      timestamp: digest.createdAt ?? "",
      captureCount: 1,
      totalTurns: 0,
      sessionIds: [digest.sourceSessionId],
      allArchived: false,
    })
  }

  // Sort by most recent first
  entries.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
  return entries
}

export async function listActivityFeedForUser(userId: string): Promise<ActivityEntry[]> {
  const repositories = createRepositoryBundle(userId)
  const projects = await getProjectSummaries(repositories, userId)
  const dashboards = await Promise.all(
    projects.map((project) => getProjectDashboard(repositories, userId, project.id)),
  )

  return buildActivityFeed(projects, dashboards)
}

/**
 * List grouped activity feed for a specific project.
 * Returns compressed capture groups instead of individual captures.
 */
export async function listGroupedActivityForProject(
  userId: string,
  projectId: string,
  options: { limit?: number; includeArchived?: boolean } = {},
): Promise<GroupedActivityEntry[]> {
  const { limit = 20, includeArchived = false } = options
  const repositories = createRepositoryBundle(userId)

  // Get project info
  const project = await repositories.projects.getById(projectId)
  if (!project) {
    return []
  }

  // Get grouped sessions and digests in parallel
  const [groupedSessions, dashboard] = await Promise.all([
    repositories.sessions.getGroupedSessions(projectId, { limit, includeArchived }),
    getProjectDashboard(repositories, userId, projectId),
  ])

  return buildGroupedActivityFeed(
    projectId,
    project.name,
    groupedSessions,
    dashboard?.recentDigests ?? [],
  )
}
