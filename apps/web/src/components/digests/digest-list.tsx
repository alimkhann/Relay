import type { SessionDigestDto } from "@relay/shared"

export function DigestList({ digests }: { digests: SessionDigestDto[] }) {
  if (digests.length === 0) {
    return (
      <p className="text-sm text-[var(--relay-muted)]">
        Updates will appear here after the next meaningful chat.
      </p>
    )
  }

  return (
    <div className="space-y-0.5">
      {digests.map((digest) => (
        <div key={digest.id} className="flex items-start gap-3 rounded-[var(--relay-radius-sm)] px-3 py-2.5 transition hover:bg-[var(--relay-soft)]">
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[10px] font-bold text-emerald-600">
            ↑
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-relaxed text-[var(--relay-ink-secondary)]">{digest.summaryShort}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
