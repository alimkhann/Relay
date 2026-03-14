import { EmptyState } from "@/components/ui/empty-state"
import type { ActivityEntry } from "@/server/services/activity-service"

export function formatRelativeTime(iso: string) {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ActivityFeed({ feed }: { feed: ActivityEntry[] }) {
  if (feed.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <EmptyState
          title="No activity yet"
          description="Activity will appear here after Relay captures chats or runs digests."
        />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
      <div className="divide-y divide-[var(--relay-line)]">
        {feed.map((entry, index) => (
          <div
            key={`${entry.timestamp}-${index}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--relay-soft)]/50"
          >
            <div
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                background:
                  entry.kind === "capture"
                    ? "var(--relay-section-decision)"
                    : "var(--relay-section-task)",
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--relay-muted)]">
                  {entry.projectName}
                </span>
                <span className="text-[10px] text-[var(--relay-faint)]">
                  {entry.kind === "capture" ? "Capture" : "Digest"}
                </span>
              </div>
              <p className="truncate text-[13px] text-[var(--relay-ink)]">{entry.title}</p>
              <p className="text-[11px] text-[var(--relay-muted)]">{entry.detail}</p>
            </div>
            <span className="shrink-0 tabular-nums text-[11px] text-[var(--relay-faint)]">
              {formatRelativeTime(entry.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
