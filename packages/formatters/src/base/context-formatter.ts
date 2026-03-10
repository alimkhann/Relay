import type { MemoryItemRow } from "@relay/shared"

export function groupMemory(items: MemoryItemRow[]): Record<string, MemoryItemRow[]> {
  return items.reduce<Record<string, MemoryItemRow[]>>((acc, item) => {
    const key = item.type
    acc[key] ??= []
    acc[key].push(item)
    return acc
  }, {})
}

export function summarizeCurrentState(items: MemoryItemRow[]): string {
  return items
    .slice(0, 3)
    .map((item) => item.content)
    .join("\n")
}
