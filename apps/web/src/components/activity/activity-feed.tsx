import type { RecentSessionDto, SessionDigestDto } from "@relay/shared"

type FeedItem =
  | { kind: "session"; data: RecentSessionDto; at: number }
  | { kind: "digest"; data: SessionDigestDto; at: number }

function formatTime(value: string | number) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  })
}

export function ActivityFeed({
  sessions,
  digests
}: {
  sessions: RecentSessionDto[]
  digests: SessionDigestDto[]
}) {
  const items: FeedItem[] = [
    ...sessions.map((s) => ({ kind: "session" as const, data: s, at: new Date(s.capturedAt).getTime() })),
    ...digests.map((d) => ({ kind: "digest" as const, data: d, at: Date.now() - digests.indexOf(d) * 60000 }))
  ].sort((a, b) => b.at - a.at)

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--relay-muted)]">
        Activity will appear here once Relay captures your first chat.
      </p>
    )
  }

  return (
    <div className="space-y-0.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3 rounded-[var(--relay-radius-sm)] px-3 py-2.5 transition hover:bg-[var(--relay-soft)]">
          {item.kind === "session" ? (
            <>
              <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--relay-soft)] text-[10px] font-bold text-[var(--relay-muted)]">
                {item.data.platform.charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-[var(--relay-ink)]">{item.data.title ?? "Untitled chat"}</p>
                <p className="text-xs text-[var(--relay-faint)]">
                  {item.data.platform} · {item.data.turnCount} turns · {formatTime(item.data.capturedAt)}
                </p>
              </div>
            </>
          ) : (
            <>
              <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[10px] font-bold text-emerald-600">
                ↑
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--relay-ink-secondary)]">{item.data.summaryShort}</p>
                <p className="text-xs text-[var(--relay-faint)]">Learned from recent chat</p>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
