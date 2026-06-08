import type { QueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/lib/query/keys"

/**
 * Relay web read-cache policy (TanStack Query client + Next unstable_cache server).
 *
 * - Client staleTime: instant revisits, background refetch when stale or invalidated.
 * - Server revalidate (300s): caps Neon reads; tag invalidation on writes busts stale rows.
 * - Mutations: optimistic setQueryData first, invalidateQueries in finally for reconcile.
 * - Do not use router.refresh() for dashboard/memory data — it skips React Query.
 */
export const AUTHENTICATED_READ_STALE_TIME_MS = 5 * 60_000

export function invalidateDashboard(queryClient: QueryClient, projectId: string) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(projectId) })
}