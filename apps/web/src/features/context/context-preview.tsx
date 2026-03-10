import type { ContextPacketDto } from "@relay/shared"

import { Card } from "@/components/ui/card"

export function ContextPreview({ packet }: { packet: ContextPacketDto | null }) {
  return (
    <Card className="p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Latest packet</p>
      <pre className="mt-4 whitespace-pre-wrap text-sm leading-6 text-stone-700">
        {packet?.content ?? "No context packet generated yet."}
      </pre>
    </Card>
  )
}
