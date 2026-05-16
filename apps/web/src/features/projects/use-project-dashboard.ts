"use client"

import { useQuery, keepPreviousData } from "@tanstack/react-query"
import type { ProjectDashboardDto } from "@relay/shared"

import { queryKeys } from "@/lib/query/keys"
import { relayClientFetch } from "@/lib/telemetry/fetch"

interface ProjectDashboardResponse {
  project: ProjectDashboardDto["project"]
  dashboard: ProjectDashboardDto
}

/**
 * Shared project dashboard query. Memory, Brief and Dashboard tabs all read
 * the same `/api/projects/[id]` payload, so one cached entry serves all three
 * — switching between them is instant with no extra fetch.
 */
export function useProjectDashboard(projectId: string) {
  return useQuery({
    queryKey: queryKeys.dashboard(projectId),
    queryFn: async (): Promise<ProjectDashboardDto | null> => {
      const response = await relayClientFetch(`/api/projects/${projectId}`, {
        telemetry: { area: "dashboard", event: "dashboard.load", context: { projectId } },
      })
      if (response.status === 404) return null
      if (!response.ok) throw new Error("Unable to load project data.")
      const payload = (await response.json()) as ProjectDashboardResponse
      return payload.dashboard
    },
    placeholderData: keepPreviousData,
  })
}
