import type { ContextPacketDto } from "@relay/shared"

import { Card } from "@/components/ui/card"

export function PacketList({ packets }: { packets: ContextPacketDto[] }) {
  return (
    <div className="grid gap-4">
      {packets.map((packet) => (
        <Card key={packet.id} className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">{packet.targetProfileKey}</p>
          <pre className="mt-4 whitespace-pre-wrap text-sm leading-6 text-stone-700">{packet.content}</pre>
        </Card>
      ))}
    </div>
  )
}
