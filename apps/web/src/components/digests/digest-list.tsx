import type { SessionDigestDto } from "@relay/shared"

import { Card } from "@/components/ui/card"

export function DigestList({ digests }: { digests: SessionDigestDto[] }) {
  if (digests.length === 0) {
    return (
      <div className="rounded-[18px] border border-dashed border-[var(--relay-line)] bg-white/70 p-5 text-sm text-[var(--relay-muted)]">
        Nothing new yet. Relay will add useful learned updates after the next meaningful chat.
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {digests.map((digest) => (
        <Card key={digest.id} className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--relay-muted)]">What Relay learned</p>
              <p className="mt-3 text-base leading-7 text-[var(--relay-ink)]">{digest.summaryShort}</p>
            </div>
            <div className="min-w-[88px] rounded-[12px] bg-[var(--relay-soft)] px-3 py-2 text-right text-xs text-[var(--relay-muted)]">
              <div>{Math.round(digest.confidence * 100)}%</div>
              <div className="mt-1">confidence</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
