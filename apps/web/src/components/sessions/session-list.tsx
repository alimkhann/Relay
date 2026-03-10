import type { RecentSessionDto } from "@relay/shared"

import { Card } from "@/components/ui/card"

export function SessionList({ sessions }: { sessions: RecentSessionDto[] }) {
  return (
    <div className="grid gap-4">
      {sessions.map((session) => (
        <Card key={session.id} className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">{session.platform}</p>
              <h3 className="mt-2 text-lg font-semibold text-stone-900">{session.title ?? session.url}</h3>
            </div>
            <span className="rounded-full bg-stone-950/5 px-3 py-1 text-xs text-stone-600">{session.turnCount} turns</span>
          </div>
          <p className="mt-3 truncate text-sm text-stone-600">{session.url}</p>
        </Card>
      ))}
    </div>
  )
}
