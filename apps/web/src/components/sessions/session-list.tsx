import type { RecentSessionDto } from "@relay/shared"

function formatCapturedAt(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  })
}

export function SessionList({ sessions }: { sessions: RecentSessionDto[] }) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-[var(--relay-muted)]">
        No recent chats yet. Supported chats will appear here automatically.
      </p>
    )
  }

  return (
    <div className="space-y-0.5">
      {sessions.map((session) => (
        <div key={session.id} className="flex items-start gap-3 rounded-[var(--relay-radius-sm)] px-3 py-2.5 transition hover:bg-[var(--relay-soft)]">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--relay-soft)] text-[10px] font-bold text-[var(--relay-muted)]">
            {session.platform.charAt(0).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-[var(--relay-ink)]">{session.title ?? session.url}</p>
            <p className="text-xs text-[var(--relay-faint)]">
              {session.platform} · {session.turnCount} turns · {formatCapturedAt(session.capturedAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
