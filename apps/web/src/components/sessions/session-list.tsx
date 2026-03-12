import type { RecentSessionDto } from "@relay/shared"

import { Card } from "@/components/ui/card"

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
      <div className="rounded-[18px] border border-dashed border-[var(--relay-line)] bg-white/70 p-5 text-sm text-[var(--relay-muted)]">
        No recent chats yet. Once Relay is connected, supported chats will appear here automatically.
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {sessions.map((session) => (
        <Card key={session.id} className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-muted)]">{session.platform}</p>
              <h3 className="mt-2 text-lg font-semibold text-[var(--relay-ink)]">{session.title ?? session.url}</h3>
              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[var(--relay-muted)]">{formatCapturedAt(session.capturedAt)}</p>
            </div>
            <span className="rounded-full bg-[var(--relay-soft)] px-3 py-1 text-xs text-[var(--relay-muted)]">{session.turnCount} turns</span>
          </div>
          <p className="mt-3 truncate text-sm text-[var(--relay-muted)]">{session.url}</p>
        </Card>
      ))}
    </div>
  )
}
