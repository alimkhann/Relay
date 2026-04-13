import type { CanonEntryDto, RecentSessionDto, SessionDigestDto } from "@relay/shared"

import { EmptyState } from "@/components/ui/empty-state"

type TimelineEvent = {
  id: string
  kind: "canon" | "session" | "digest"
  title: string
  detail: string | null
  at: string
}

export function TimelineView({
  canon,
  sessions,
  digests,
}: {
  canon: CanonEntryDto[]
  sessions: RecentSessionDto[]
  digests: SessionDigestDto[]
}) {
  const events: TimelineEvent[] = [
    ...canon.map((entry) => ({
      id: `canon-${entry.id}`,
      kind: "canon" as const,
      title: entry.title ?? entry.kind,
      detail: `${entry.kind} · ${entry.status}`,
      at: entry.updatedAt,
    })),
    ...sessions.map((session) => ({
      id: `session-${session.id}`,
      kind: "session" as const,
      title: session.title ?? session.platform,
      detail: `${session.platform} · ${session.turnCount} turns`,
      at: session.capturedAt,
    })),
    ...digests.map((digest) => ({
      id: `digest-${digest.id}`,
      kind: "digest" as const,
      title: digest.summaryShort,
      detail: digest.shouldMerge ? "needs canon merge" : null,
      at: digest.createdAt,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  if (events.length === 0) {
    return (
      <EmptyState
        title="No timeline events yet"
        description="Captures, digests, and canon updates will appear here in reverse chronological order."
      />
    )
  }

  const groups = groupByDay(events)

  return (
    <div className="space-y-6">
      {groups.map(([day, dayEvents]) => (
        <section key={day} className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-[0.18em] text-[var(--relay-faint)]">{day}</h3>
          <ol className="relative border-l border-[var(--relay-line)] pl-4">
            {dayEvents.map((event) => (
              <li key={event.id} className="relative pb-3">
                <span
                  aria-hidden
                  className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-[var(--relay-muted)]"
                />
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[var(--relay-ink)] truncate">
                      {kindBadge(event.kind)} {event.title}
                    </p>
                    {event.detail ? (
                      <p className="text-[11px] text-[var(--relay-muted)]">{event.detail}</p>
                    ) : null}
                  </div>
                  <span className="text-[11px] text-[var(--relay-faint)] whitespace-nowrap">
                    {new Date(event.at).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

function kindBadge(kind: TimelineEvent["kind"]): string {
  if (kind === "canon") return "Canon ·"
  if (kind === "session") return "Session ·"
  return "Digest ·"
}

function groupByDay(events: TimelineEvent[]): [string, TimelineEvent[]][] {
  const map = new Map<string, TimelineEvent[]>()
  for (const event of events) {
    const day = new Date(event.at).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    const list = map.get(day) ?? []
    list.push(event)
    map.set(day, list)
  }
  return Array.from(map.entries())
}
