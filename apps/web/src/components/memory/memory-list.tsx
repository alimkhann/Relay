import type { MemoryItemDto } from "@relay/shared"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

export function MemoryList({ items }: { items: MemoryItemDto[] }) {
  return (
    <div className="grid gap-4">
      {items.map((item) => (
        <Card key={item.id} className="p-5">
          <div className="flex items-center justify-between gap-3">
            <Badge className="bg-stone-900/85">{item.type}</Badge>
            {item.pinned ? <span className="text-xs font-medium uppercase tracking-[0.2em] text-stone-500">Pinned</span> : null}
          </div>
          <h3 className="mt-4 text-lg font-semibold text-stone-900">{item.title ?? "Untitled memory"}</h3>
          <p className="mt-2 text-sm leading-6 text-stone-700">{item.content}</p>
        </Card>
      ))}
    </div>
  )
}
