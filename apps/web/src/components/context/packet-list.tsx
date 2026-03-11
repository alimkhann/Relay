import type { BootstrapPacketDto, ContextPacketDto } from "@relay/shared"

import { Card } from "@/components/ui/card"

export function PacketList({ packets }: { packets: Array<ContextPacketDto | BootstrapPacketDto> }) {
  if (packets.length === 0) {
    return (
      <div className="rounded-[18px] border border-dashed border-[var(--relay-line)] bg-white/70 p-5 text-sm text-[var(--relay-muted)]">
        No bootstrap packets yet. Relay will render one after the next fresh-chat handoff request.
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {packets.map((packet) => (
        <Card key={packet.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-muted)]">{packet.targetProfileKey}</p>
            {"kind" in packet ? (
              <span className="rounded-[999px] bg-[var(--relay-soft)] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[var(--relay-muted)]">
                {packet.kind.replaceAll("_", " ")} · {packet.renderer}
              </span>
            ) : null}
          </div>
          <pre className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--relay-muted)]">{packet.content}</pre>
        </Card>
      ))}
    </div>
  )
}
