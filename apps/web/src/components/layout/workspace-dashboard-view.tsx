"use client"

import type { ProjectDashboardDto } from "@relay/shared"

import { DashboardContent } from "@/features/projects/dashboard-content"

export function WorkspaceDashboardView({
  project,
  dashboard
}: {
  project: { id: string; name: string; description?: string | null }
  dashboard: ProjectDashboardDto
}) {
  return (
    <div className="pt-6">
      <DashboardContent project={project} dashboard={dashboard} />
    </div>
  )
}
