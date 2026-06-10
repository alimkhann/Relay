import { describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { createElement, type ReactNode } from "react"

import type { MemoryItemDto, ProjectDashboardDto } from "@relay/shared"

import { queryKeys } from "@/lib/query/keys"
import { useOptimisticMemoryMutation } from "./use-optimistic-memory-mutation"

function item(id: string): MemoryItemDto {
  return {
    id,
    type: "note",
    title: null,
    content: `note ${id}`,
    pinned: false,
    updatedAt: "2026-06-09T00:00:00.000Z",
    sourceSurface: "web",
    sourceUrl: null,
    capturedAt: "2026-06-09T00:00:00.000Z",
    decayScore: 1,
    lastReaffirmedAt: null,
  }
}

function dashboard(memory: MemoryItemDto[]): ProjectDashboardDto {
  return { project: { id: "p1" }, memory } as ProjectDashboardDto
}

describe("useOptimisticMemoryMutation", () => {
  it("keeps the deleted item out of cache and avoids an immediate refetch", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const refetchSpy = vi.spyOn(queryClient, "refetchQueries")
    const key = queryKeys.dashboard("p1")
    queryClient.setQueryData(key, dashboard([item("m1")]))

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(() => useOptimisticMemoryMutation("p1"), { wrapper })

    await act(async () => {
      await result.current(
        { operation: "delete", status: "optimistic", sourceProjectId: "p1", before: item("m1") },
        async () => ({
          operation: "delete",
          status: "succeeded",
          sourceProjectId: "p1",
          before: item("m1"),
        }),
      )
    })

    expect(queryClient.getQueryData<ProjectDashboardDto>(key)?.memory).toEqual([])
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: key, refetchType: "none" }),
    )
    expect(refetchSpy).not.toHaveBeenCalled()
  })
})