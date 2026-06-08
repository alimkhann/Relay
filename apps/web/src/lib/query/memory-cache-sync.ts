"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  actionResultToMemoryMutations,
  applyMemoryMutationToDashboard,
  type AssistantActionResult,
  type MemoryMutationEnvelope,
  type ProjectDashboardDto,
} from "@relay/shared"

import { invalidateDashboard } from "@/lib/query/policy"
import { queryKeys } from "@/lib/query/keys"

function affectedProjectIds(mutations: MemoryMutationEnvelope[]) {
  return [
    ...new Set(
      mutations.flatMap((mutation) =>
        [mutation.sourceProjectId, mutation.targetProjectId].filter((id): id is string => Boolean(id)),
      ),
    ),
  ]
}

function mutationsForProject(mutations: MemoryMutationEnvelope[], projectId: string) {
  return mutations.filter(
    (mutation) => mutation.sourceProjectId === projectId || mutation.targetProjectId === projectId,
  )
}

export function syncDashboardFromActionResult(
  queryClient: ReturnType<typeof useQueryClient>,
  result: AssistantActionResult,
  fallbackProjectId?: string | null,
) {
  const mutations = actionResultToMemoryMutations(result, fallbackProjectId)
  if (mutations.length === 0) return

  for (const projectId of affectedProjectIds(mutations)) {
    queryClient.setQueryData<ProjectDashboardDto | null>(queryKeys.dashboard(projectId), (current) => {
      if (!current) return current
      let next = current
      for (const mutation of mutationsForProject(mutations, projectId)) {
        next = applyMemoryMutationToDashboard(next, mutation)
      }
      return next
    })
    void invalidateDashboard(queryClient, projectId)
  }
}

/** Keeps memory/brief/dashboard React Query caches fresh after agent or cross-widget writes. */
export function useMemoryCacheSync(fallbackProjectId?: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const onMutated = (event: Event) => {
      const result = (event as CustomEvent<AssistantActionResult>).detail
      if (!result) return
      syncDashboardFromActionResult(queryClient, result, fallbackProjectId)
    }
    window.addEventListener("relay:memory-mutated", onMutated)
    return () => window.removeEventListener("relay:memory-mutated", onMutated)
  }, [queryClient, fallbackProjectId])
}