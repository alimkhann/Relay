import type { ContextPacketDto } from "@relay/shared"

import { Card } from "@/components/ui/card"

export function PacketList({ packets }: { packets: ContextPacketDto[] }) {
  if (packets.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-[var(--relay-line)] bg-white/70 p-5 text-sm text-[var(--relay-muted)]">
        No context packets yet. Compose one from the extension or project view when you are ready to move into the next tool.
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {packets.map((packet) => (
        <Card key={packet.id} className="border-[var(--relay-line)] bg-white/82 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-muted)]">{packet.targetProfileKey}</p>
          <pre className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--relay-muted)]">{packet.content}</pre>
        </Card>
      ))}
    </div>
  )
}
