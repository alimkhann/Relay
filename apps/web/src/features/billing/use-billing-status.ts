"use client"

import { useQuery, keepPreviousData } from "@tanstack/react-query"
import type { BillingStatusDto } from "@relay/shared/types/billing"

import { relayClientFetch } from "@/lib/telemetry/fetch"

export function useBillingStatus() {
  return useQuery({
    queryKey: ["billing"],
    queryFn: async (): Promise<BillingStatusDto | null> => {
      const response = await relayClientFetch("/api/billing/status", {
        telemetry: { area: "billing", event: "billing.status" },
      })
      if (!response.ok) throw new Error("Unable to load billing status.")
      const payload = (await response.json()) as { billing: BillingStatusDto }
      return payload.billing ?? null
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}
