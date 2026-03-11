import type { MemoryItemRow, SourceSessionRow } from "@relay/shared"

export function groupMemory(items: MemoryItemRow[]): Record<string, MemoryItemRow[]> {
  return items.reduce<Record<string, MemoryItemRow[]>>((acc, item) => {
    const key = item.type
    acc[key] ??= []
    acc[key].push(item)
    return acc
  }, {})
}

export function summarizeCurrentState(items: MemoryItemRow[], recentSessions: SourceSessionRow[] = []): string {
  const memorySummary = items
    .slice(0, 3)
    .map((item) => item.content)
    .join("\n")

  if (memorySummary) {
    return memorySummary
  }

  const sessionSummary = recentSessions
    .slice(0, 3)
    .map((session) => session.title ?? session.url)
    .filter(Boolean)
    .join("\n")

  return sessionSummary || "No captured context yet. Capture visible turns or pin memory first."
}
