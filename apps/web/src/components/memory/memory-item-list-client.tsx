"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import type { MemoryItemDto } from "@relay/shared"

import { MemoryItemList } from "@/components/memory/memory-item-card"
import { relayClientFetch } from "@/lib/telemetry/fetch"

interface MemoryItemListClientProps {
  items: MemoryItemDto[]
  emptyLabel?: string
  showTypeLabel?: boolean
  accentClass?: string
  maxHeight?: string
  lifecycleByItemId?: Record<string, "active" | "cooling" | "archived" | "forgotten" | null>
}

/**
 * Thin client wrapper around MemoryItemList that wires the DELETE round-trip
 * + router.refresh so server-rendered surfaces (personal page, dashboard
 * memory sections) don't have to plumb their own state.
 */
export function MemoryItemListClient({
  items,
  emptyLabel,
  showTypeLabel,
  accentClass,
  maxHeight,
  lifecycleByItemId,
}: MemoryItemListClientProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())

  const setBusy = (id: string, on: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const onDelete = (item: MemoryItemDto) => {
    setBusy(item.id, true)
    startTransition(() => {
      void (async () => {
        try {
          const res = await relayClientFetch(`/api/memory/${item.id}`, {
            method: "DELETE",
          })
          if (!res.ok) throw new Error("Delete failed")
          router.refresh()
        } catch {
          // best-effort
        } finally {
          setBusy(item.id, false)
        }
      })()
    })
  }

  return (
    <MemoryItemList
      items={items}
      emptyLabel={emptyLabel}
      showTypeLabel={showTypeLabel}
      accentClass={accentClass}
      maxHeight={maxHeight}
      onDelete={onDelete}
      busyIds={busyIds}
      lifecycleByItemId={lifecycleByItemId}
    />
  )
}
