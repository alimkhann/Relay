import { Lock } from "lucide-react"
import type { CanonEntryDto, CanonEntryKind } from "@relay/shared"

import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusChip, kindLabel } from "@/components/dashboard/cockpit-cards"

const KIND_ORDER: CanonEntryKind[] = [
  "objective",
  "decision",
  "constraint",
  "task",
  "progress",
  "architecture_fact",
  "risk",
  "assumption",
  "question",
  "artifact",
]

export function CanonView({ canon }: { canon: CanonEntryDto[] }) {
  if (canon.length === 0) {
    return (
      <EmptyState
        title="No canon entries yet"
        description="Canon is the project's stable truth — objectives, decisions, constraints, open tasks. It fills in automatically as Relay reflects on your sessions, or you can add entries manually."
      />
    )
  }

  const groups = new Map<CanonEntryKind, CanonEntryDto[]>()
  for (const entry of canon) {
    const list = groups.get(entry.kind) ?? []
    list.push(entry)
    groups.set(entry.kind, list)
  }

  const orderedKinds = KIND_ORDER.filter((kind) => groups.has(kind))

  return (
    <div className="space-y-6">
      {orderedKinds.map((kind) => {
        const entries = groups.get(kind) ?? []
        return (
          <section key={kind} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--relay-muted)]">
                {kindLabel(kind)}
              </h2>
              <span className="text-xs text-[var(--relay-faint)]">
                {entries.length} {entries.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            <div className="grid gap-3">
              {entries.map((entry) => (
                <CanonRow key={entry.id} entry={entry} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function CanonRow({ entry }: { entry: CanonEntryDto }) {
  return (
    <Card className="p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {entry.title ? (
            <h3 className="text-sm font-semibold text-[var(--relay-ink)] truncate">
              {entry.title}
            </h3>
          ) : null}
          <StatusChip status={entry.status} />
          {entry.lockedByUser ? (
            <Lock className="h-3 w-3 text-[var(--relay-muted)]" aria-label="Locked" />
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--relay-faint)]">
          <span>conf {(entry.confidence * 100).toFixed(0)}%</span>
          {entry.evidence && entry.evidence.length > 0 ? (
            <span>· {entry.evidence.length} evidence</span>
          ) : null}
        </div>
      </div>
      <p className="text-[13px] leading-relaxed text-[var(--relay-ink)] whitespace-pre-wrap">
        {entry.content}
      </p>
      {entry.validFrom || entry.validUntil ? (
        <p className="text-[11px] text-[var(--relay-faint)]">
          {entry.validFrom ? `from ${formatDate(entry.validFrom)}` : null}
          {entry.validFrom && entry.validUntil ? " · " : null}
          {entry.validUntil ? `until ${formatDate(entry.validUntil)}` : null}
        </p>
      ) : null}
    </Card>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}
