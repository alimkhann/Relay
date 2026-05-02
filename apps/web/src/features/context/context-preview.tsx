import type { ContextPacketDto } from "@relay/shared"

import { Card } from "@/components/ui/card"

export function ContextPreview({ packet }: { packet: ContextPacketDto | null }) {
  return (
    <Card className="p-0 border-none py-0">
      <p className="text-[13px] font-medium tracking-wide uppercase text-[var(--relay-ink)] opacity-70 mb-4">Latest packet</p>
      <pre className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--relay-ink-secondary)] bg-[var(--relay-soft)] p-4 rounded-[var(--relay-radius-sm)]">
        {packet?.content ?? "No context packet generated yet."}
      </pre>
    </Card>
  )
}
