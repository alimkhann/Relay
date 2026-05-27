"use client"

import type { MemoryItemDto } from "@relay/shared"

import { MemoryItemListClient } from "@/components/memory/memory-item-list-client"

interface MemoryItemsListProps {
  items: MemoryItemDto[]
  label: string
  projectId: string
}

/**
 * Thin wrapper around the shared MemoryItemListClient so existing callers
 * (memory-page-content notes/requirements/artifacts sections) keep their
 * import surface. Sort + lifecycle pills + actions live in the shared card.
 */
export function MemoryItemsList({ items, label, projectId }: MemoryItemsListProps) {
  void projectId
  const sorted = [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
  return (
    <MemoryItemListClient
      items={sorted}
      emptyLabel={label.toLowerCase()}
      showTypeLabel={false}
    />
  )
}
