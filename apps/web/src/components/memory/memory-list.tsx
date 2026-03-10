import type { MemoryItemDto } from "@relay/shared"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

export function MemoryList({ items }: { items: MemoryItemDto[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-[var(--relay-line)] bg-white/70 p-5 text-sm text-[var(--relay-muted)]">
        No pinned memory yet. Save a snippet from the extension and it will show up here.
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {items.map((item) => (
        <Card key={item.id} className="border-[var(--relay-line)] bg-white/82 p-5">
          <div className="flex items-center justify-between gap-3">
            <Badge className="bg-[var(--relay-accent)]">{item.type}</Badge>
            {item.pinned ? <span className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--relay-muted)]">Pinned</span> : null}
          </div>
          <h3 className="mt-4 text-lg font-semibold text-[var(--relay-ink)]">{item.title ?? "Untitled memory"}</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--relay-muted)]">{item.content}</p>
        </Card>
      ))}
    </div>
  )
}
