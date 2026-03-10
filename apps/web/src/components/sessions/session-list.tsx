import type { RecentSessionDto } from "@relay/shared"

import { Card } from "@/components/ui/card"

export function SessionList({ sessions }: { sessions: RecentSessionDto[] }) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-[var(--relay-line)] bg-white/70 p-5 text-sm text-[var(--relay-muted)]">
        No captures yet. Open a supported AI tab, bind the project, then run a visible-turn capture from the extension.
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {sessions.map((session) => (
        <Card key={session.id} className="border-[var(--relay-line)] bg-white/82 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-muted)]">{session.platform}</p>
              <h3 className="mt-2 text-lg font-semibold text-[var(--relay-ink)]">{session.title ?? session.url}</h3>
            </div>
            <span className="rounded-full bg-[var(--relay-soft)] px-3 py-1 text-xs text-[var(--relay-muted)]">{session.turnCount} turns</span>
          </div>
          <p className="mt-3 truncate text-sm text-[var(--relay-muted)]">{session.url}</p>
        </Card>
      ))}
    </div>
  )
}
