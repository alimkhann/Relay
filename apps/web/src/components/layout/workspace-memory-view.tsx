"use client"

import type { ProjectDashboardDto } from "@relay/shared"

import { MemoryPageContent } from "@/features/memory/memory-page-content"

export function WorkspaceMemoryView({
  project,
  dashboard,
}: {
  project: { id: string; name: string; description?: string | null }
  dashboard: ProjectDashboardDto
}) {
  return <MemoryPageContent project={project} dashboard={dashboard} />
}
