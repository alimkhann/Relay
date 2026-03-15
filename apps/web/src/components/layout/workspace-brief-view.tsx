"use client"

import type { ProjectDashboardDto } from "@relay/shared"

import { BriefPageContent } from "@/features/brief/brief-page-content"
import { EmptyState } from "@/components/ui/empty-state"

export function WorkspaceBriefView({
  project,
  dashboard,
}: {
  project: { id: string; name: string }
  dashboard: ProjectDashboardDto | null
}) {
  if (!dashboard) {
    return (
      <EmptyState
        title="No data yet"
        description="Briefs will appear after your first chat capture."
        className="py-12"
      />
    )
  }

  return <BriefPageContent project={project} dashboard={dashboard} />
}
