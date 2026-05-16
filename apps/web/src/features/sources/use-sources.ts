"use client"

import { useQuery, keepPreviousData } from "@tanstack/react-query"
import type { ProjectSourceDto } from "@relay/shared"

import { queryKeys } from "@/lib/query/keys"
import { relayClientFetch } from "@/lib/telemetry/fetch"

export function useSources(projectId: string) {
  return useQuery({
    queryKey: queryKeys.sources(projectId),
    queryFn: async (): Promise<ProjectSourceDto[]> => {
      const response = await relayClientFetch(`/api/projects/${projectId}/sources`, {
        telemetry: { area: "sources", event: "sources.list", context: { projectId } },
      })
      if (!response.ok) throw new Error("Unable to load sources.")
      const payload = (await response.json()) as { sources: ProjectSourceDto[] }
      return payload.sources
    },
    placeholderData: keepPreviousData,
    // Poll only while something is processing so status reflects in real time.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((s) => s.status === "processing") ? 2500 : false,
  })
}
