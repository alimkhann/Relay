"use client"

import { useQuery, keepPreviousData } from "@tanstack/react-query"
import type {
  ActivityEntry,
  GroupedActivityEntry,
} from "@/server/services/activity-service"
import { relayClientFetch } from "@/lib/telemetry/fetch"

export function useActivityAll() {
  return useQuery({
    queryKey: ["activity", "all"],
    queryFn: async (): Promise<ActivityEntry[]> => {
      const response = await relayClientFetch("/api/activity", {
        telemetry: { area: "activity", event: "activity.all" },
      })
      if (!response.ok) throw new Error("Unable to load activity.")
      const payload = (await response.json()) as { feed: ActivityEntry[] }
      return payload.feed
    },
    placeholderData: keepPreviousData,
  })
}

export function useActivityProject(projectId: string) {
  return useQuery({
    queryKey: ["activity", projectId],
    queryFn: async (): Promise<GroupedActivityEntry[]> => {
      const response = await relayClientFetch(
        `/api/projects/${projectId}/activity`,
        {
          telemetry: {
            area: "activity",
            event: "activity.project",
            context: { projectId },
          },
        },
      )
      if (!response.ok) throw new Error("Unable to load activity.")
      const payload = (await response.json()) as {
        activity: GroupedActivityEntry[]
      }
      return payload.activity
    },
    placeholderData: keepPreviousData,
  })
}
