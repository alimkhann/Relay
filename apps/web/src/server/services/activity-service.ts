import { createRepositoryBundle, getProjectDashboard, getProjectSummaries } from "@relay/db"

import type { ProjectDashboardDto } from "@relay/shared"

export interface ActivityEntry {
  kind: "capture" | "digest"
  projectName: string
  title: string
  detail: string
  timestamp: string
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
        projectName: project.name,
        title: session.title ?? session.url,
        detail: `${session.platform} · ${session.turnCount} turns${session.isArchived ? " · detached" : ""}`,
        timestamp: session.capturedAt ?? "",
      })
    }

    for (const digest of dashboard.recentDigests) {
      entries.push({
        kind: "digest",
        projectName: project.name,
        title: digest.summaryShort ?? "Digest run",
        detail: `confidence ${Math.round((digest.confidence ?? 0) * 100)}%${digest.shouldMerge ? " · merged" : ""}`,
        timestamp: digest.createdAt ?? "",
      })
    }
  })

  entries.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1))
  return entries.slice(0, 50)
}

export async function listActivityFeedForUser(userId: string): Promise<ActivityEntry[]> {
  const repositories = createRepositoryBundle(userId)
  const projects = await getProjectSummaries(repositories, userId)
  const dashboards = await Promise.all(
    projects.map((project) => getProjectDashboard(repositories, userId, project.id)),
  )

  return buildActivityFeed(projects, dashboards)
}
