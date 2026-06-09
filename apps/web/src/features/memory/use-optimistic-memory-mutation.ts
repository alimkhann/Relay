"use client"

import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { applyMemoryMutationToDashboard, type MemoryMutationEnvelope } from "@relay/shared/utils/memory-mutations"
import type { ProjectDashboardDto } from "@relay/shared"

import { queryKeys } from "@/lib/query/keys"

export function useOptimisticMemoryMutation(projectId: string) {
  const queryClient = useQueryClient()

  return useCallback(
    async (
      optimistic: MemoryMutationEnvelope,
      request: () => Promise<MemoryMutationEnvelope>,
    ) => {
      const affectedProjectIds = [...new Set([
        projectId,
        optimistic.sourceProjectId,
        optimistic.targetProjectId,
      ].filter((id): id is string => Boolean(id)))]
      const keys = affectedProjectIds.map((id) => queryKeys.dashboard(id))
      await Promise.all(keys.map((key) => queryClient.cancelQueries({ queryKey: key })))
      const previous = new Map(
        keys.map((key) => [JSON.stringify(key), queryClient.getQueryData<ProjectDashboardDto | null>(key)]),
      )
      for (const key of keys) {
        queryClient.setQueryData<ProjectDashboardDto | null>(key, (current) =>
          current ? applyMemoryMutationToDashboard(current, optimistic) : current,
        )
      }

      try {
        const settled = await request()
        for (const key of keys) {
          queryClient.setQueryData<ProjectDashboardDto | null>(key, (current) =>
            current ? applyMemoryMutationToDashboard(current, settled) : current,
          )
        }
        return settled
      } catch (error) {
        for (const key of keys) queryClient.setQueryData(key, previous.get(JSON.stringify(key)))
        throw error
      } finally {
        for (const key of keys) {
          void queryClient.invalidateQueries({ queryKey: key, refetchType: "none" })
        }
      }
    },
    [projectId, queryClient],
  )
}
