import type { MemoryItemRow, RecentTurnSnippet, SourceSessionRow } from "@relay/shared"

export function groupMemory(items: MemoryItemRow[]): Record<string, MemoryItemRow[]> {
  return items.reduce<Record<string, MemoryItemRow[]>>((acc, item) => {
    const key = item.type
    acc[key] ??= []
    acc[key].push(item)
    return acc
  }, {})
}

export function summarizeCurrentState(
  items: MemoryItemRow[],
  recentTurns: RecentTurnSnippet[] = [],
  recentSessions: SourceSessionRow[] = []
): string {
  const memorySummary = items
    .slice(0, 3)
    .map((item) => item.content)
    .join("\n")

  if (memorySummary) {
    return memorySummary
  }

  const turnSummary = recentTurns
    .slice(-3)
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join("\n")

  if (turnSummary) {
    return turnSummary
  }

  const sessionSummary = recentSessions
    .slice(0, 3)
    .map((session) => session.title ?? session.url)
    .filter(Boolean)
    .join("\n")

  return sessionSummary || "No captured context yet. Capture visible turns or pin memory first."
}

export function formatRecentTurns(recentTurns: RecentTurnSnippet[]) {
  return recentTurns.slice(-4).map((turn) => `- ${turn.role}: ${turn.content}`)
}
